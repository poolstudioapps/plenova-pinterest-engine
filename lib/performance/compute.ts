/**
 * The Performances figures for any period, computed in the browser from the
 * daily series stored by lib/performance/refresh.ts - so switching between 7,
 * 30, 60 days, "since the start" or dates picked in the calendar is instant.
 * No server import here: this module ships to the client.
 *
 * Days are UTC days (YYYY-MM-DD), ranges include both ends.
 */

export interface PerfCohort {
  cohortStart: string;
  size: number;
  perCustomer: {
    d0: number | null;
    d7: number | null;
    d30: number | null;
    lifetime: number | null;
  };
  revenue: {
    d0: number | null;
    d7: number | null;
    d30: number | null;
    lifetime: number | null;
  };
  complete: { d0: boolean; d7: boolean; d30: boolean };
}

export interface PerfSpendEntry {
  id: string;
  from: string;
  to: string;
  channel: string;
  amount: number;
  note: string | null;
  createdBy: string | null;
}

export interface PerfSourceStatus {
  source: "revenuecat" | "amplitude" | "appsflyer";
  label: string;
  configured: boolean;
  lastOk: string | null;
  lastAttempt: string | null;
  error: string | null;
}

export interface PerfPayload {
  today: string;
  /** The first day any source has data for ("since the start"). */
  firstDay: string;
  /** `${source}:${metric}` -> day -> value. */
  series: Record<string, Record<string, number>>;
  cohorts: PerfCohort[];
  spend: PerfSpendEntry[];
  sources: PerfSourceStatus[];
  rc: {
    churnMonths: {
      month: string;
      rate: number | null;
      churned: number | null;
      actives: number | null;
      incomplete: boolean;
    }[];
    ltvPerCustomer: number | null;
    ltvPerPayingCustomer: number | null;
    predicted12: number | null;
    predicted24: number | null;
  } | null;
  amplitude: { homeSegment: string | null } | null;
  appsflyerHasCost: boolean;
}

export interface Range {
  from: string;
  to: string;
}

export type Preset = "7" | "30" | "60" | "all";

const DAY_MS = 86_400_000;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) =>
  fromMs(toMs(day) + n * DAY_MS);
export const dayCount = (r: Range) =>
  Math.round((toMs(r.to) - toMs(r.from)) / DAY_MS) + 1;

export function daysOf(r: Range): string[] {
  const out: string[] = [];
  for (let ms = toMs(r.from); ms <= toMs(r.to); ms += DAY_MS)
    out.push(fromMs(ms));
  return out;
}

export function presetRange(
  preset: Preset,
  today: string,
  firstDay: string,
): Range {
  // Whole days: a preset ends yesterday, so it compares fairly with the
  // period before it (today is still filling up). The calendar can pick today.
  const to = addDays(today, -1);
  if (preset === "all")
    return firstDay <= to ? { from: firstDay, to } : { from: today, to: today };
  return { from: addDays(to, -(Number(preset) - 1)), to };
}

/** The period of the same length just before, if the data reaches that far. */
export function previousRange(r: Range, firstDay: string): Range | null {
  const n = dayCount(r);
  const prev = { from: addDays(r.from, -n), to: addDays(r.from, -1) };
  return prev.from >= firstDay ? prev : null;
}

/* ------------------------------------------------------------ series -- */

export class Series {
  constructor(private readonly data: Record<string, Record<string, number>>) {}

  private of(key: string): Record<string, number> {
    return this.data[key] ?? {};
  }

  has(key: string, r: Range): boolean {
    const s = this.of(key);
    return daysOf(r).some((d) => s[d] !== undefined);
  }

  sum(key: string, r: Range): number {
    const s = this.of(key);
    return daysOf(r).reduce((n, d) => n + (s[d] ?? 0), 0);
  }

  /** The values of the range's days that have one, in order. */
  private present(key: string, r: Range): number[] {
    const s = this.of(key);
    const out: number[] = [];
    for (const d of daysOf(r)) {
      const v = s[d];
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  avg(key: string, r: Range): number | null {
    const values = this.present(key, r);
    return values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  }

  /** The value of the latest day of the range that has one. */
  last(key: string, r: Range): number | null {
    return this.present(key, r).at(-1) ?? null;
  }

  first(key: string, r: Range): number | null {
    return this.present(key, r)[0] ?? null;
  }
}

/** Spend per day: AppsFlyer's cost plus the entries typed in, spread evenly over their days. */
export function spendByDay(
  payload: PerfPayload,
  r: Range,
): Map<string, number> {
  const out = new Map<string, number>();
  const cost = payload.series["appsflyer:cost"] ?? {};
  for (const d of daysOf(r)) out.set(d, cost[d] ?? 0);
  for (const e of payload.spend) {
    const span = dayCount({ from: e.from, to: e.to });
    const perDay = e.amount / span;
    const from = e.from > r.from ? e.from : r.from;
    const to = e.to < r.to ? e.to : r.to;
    if (from > to) continue;
    for (const d of daysOf({ from, to }))
      out.set(d, (out.get(d) ?? 0) + perDay);
  }
  return out;
}

const ratio = (a: number | null, b: number | null) =>
  a !== null && b !== null && b > 0 ? a / b : null;

export interface Kpis {
  days: number;
  // RevenueCat
  revenue: number;
  transactions: number;
  mrr: number | null;
  activeSubscriptions: number | null;
  newCustomers: number;
  refundRate: number | null;
  refunded: number;
  /**
   * Monthly churn over the period: subscriptions lost ÷ average active
   * subscriptions, brought to 30 days - comparable from 7 days to "since the
   * start", where lost ÷ actives-at-the-start would explode.
   */
  churnRate: number | null;
  churned: number;
  paying7Rate: number | null;
  paying7: number;
  paying7Base: number;
  /** Customers of the last 7 days cannot have converted within 7 days yet. */
  paying7Partial: boolean;
  /** Same for the 7-day purchase funnel: users of the last 7 days are still inside the window. */
  purchase7Partial: boolean;
  // Acquisition
  installs: number;
  installsOrganic: number;
  installsPaid: number;
  newUsers: number;
  spend: number;
  roas: number | null;
  cpi: number | null;
  // Usage
  dauAvg: number | null;
  wau: number | null;
  mau: number | null;
  stickiness: number | null;
  // Conversion (Amplitude)
  onboardingRate: number | null;
  onboardingDone: number;
  onboardingStart: number;
  homeRate: number | null;
  homeDone: number;
  homeStart: number;
  purchase7Rate: number | null;
  purchase7Done: number;
  purchase7Start: number;
  buyers: number;
  buyersRate: number | null;
  // Unit economics
  arpuMonthly: number | null;
  arppuMonthly: number | null;
  has: { revenuecat: boolean; amplitude: boolean; appsflyer: boolean };
}

export function kpis(payload: PerfPayload, r: Range): Kpis {
  const s = new Series(payload.series);
  const days = dayCount(r);
  const revenue = s.sum("revenuecat:revenue", r);
  const spendMap = spendByDay(payload, r);
  const spend = [...spendMap.values()].reduce((a, b) => a + b, 0);
  const installs = s.sum("appsflyer:installs", r);
  const avgMau = s.avg("amplitude:mau", r);
  const avgActives = s.avg("revenuecat:actives", r);
  const monthlyRevenue = days > 0 ? (revenue / days) * 30 : null;

  const onboardingStart = s.sum("amplitude:onboarding_start", r);
  const onboardingDone = s.sum("amplitude:onboarding_done", r);
  const homeStart = s.sum("amplitude:onboarding_home_start", r);
  const homeDone = s.sum("amplitude:onboarding_home_done", r);
  const purchase7Start = s.sum("amplitude:purchase_7d_start", r);
  const purchase7Done = s.sum("amplitude:purchase_7d_done", r);
  const newUsers = s.sum("amplitude:new_users", r);
  const buyers = s.sum("amplitude:buyers", r);
  const paying7Base = s.sum("revenuecat:conv_new_customers", r);
  const paying7 = s.sum("revenuecat:conv_paying_7d", r);
  const refundTx = s.sum("revenuecat:refund_transactions", r);
  const refunded = s.sum("revenuecat:refund_refunded", r);
  const churned = s.sum("revenuecat:churn_churned", r);
  const dauAvg = s.avg("amplitude:dau", r);

  return {
    days,
    revenue,
    transactions: s.sum("revenuecat:transactions", r),
    mrr: s.last("revenuecat:mrr", r),
    activeSubscriptions: s.last("revenuecat:actives", r),
    newCustomers: s.sum("revenuecat:new_customers", r),
    refundRate: ratio(refunded, refundTx),
    refunded,
    churnRate: (() => {
      const monthly = ratio(churned, s.avg("revenuecat:churn_actives", r));
      return monthly === null ? null : (monthly * 30) / days;
    })(),
    churned,
    paying7Rate: ratio(paying7, paying7Base),
    paying7,
    paying7Base,
    paying7Partial: r.to > addDays(payload.today, -8),
    purchase7Partial: r.to > addDays(payload.today, -8),
    installs,
    installsOrganic: s.sum("appsflyer:installs_organic", r),
    installsPaid: s.sum("appsflyer:installs_paid", r),
    newUsers,
    spend,
    roas: ratio(revenue, spend),
    cpi: ratio(spend, installs),
    dauAvg,
    wau: s.last("amplitude:wau", r),
    mau: s.last("amplitude:mau", r),
    stickiness: ratio(dauAvg, avgMau),
    onboardingRate: ratio(onboardingDone, onboardingStart),
    onboardingDone,
    onboardingStart,
    homeRate: ratio(homeDone, homeStart),
    homeDone,
    homeStart,
    purchase7Rate: ratio(purchase7Done, purchase7Start),
    purchase7Done,
    purchase7Start,
    buyers,
    buyersRate: ratio(buyers, newUsers),
    arpuMonthly: ratio(monthlyRevenue, avgMau),
    arppuMonthly: ratio(monthlyRevenue, avgActives),
    has: {
      revenuecat: s.has("revenuecat:revenue", r),
      amplitude: s.has("amplitude:dau", r),
      appsflyer: s.has("appsflyer:installs", r),
    },
  };
}

/* ----------------------------------------------------------- cohorts -- */

export interface CohortRow extends PerfCohort {
  spend: number;
  roas: {
    d0: number | null;
    d7: number | null;
    d30: number | null;
    lifetime: number | null;
  };
}

export interface CohortTotals {
  size: number;
  spend: number;
  /** Revenue and spend of the cohorts that have reached day N (all of them for "to date"). */
  revenue: { d0: number; d7: number; d30: number; lifetime: number };
  spendAt: { d0: number; d7: number; d30: number; lifetime: number };
  roas: {
    d0: number | null;
    d7: number | null;
    d30: number | null;
    lifetime: number | null;
  };
  perCustomer: {
    d0: number | null;
    d7: number | null;
    d30: number | null;
    lifetime: number | null;
  };
  sizeAt: { d0: number; d7: number; d30: number; lifetime: number };
}

/**
 * The weekly cohorts of new customers (Sunday to Saturday) that overlap the
 * range, with the spend of their whole week - so the table's spend can exceed
 * the period's when the range cuts a week.
 */
export function cohortRows(
  payload: PerfPayload,
  r: Range,
): { rows: CohortRow[]; totals: CohortTotals } {
  const rows = payload.cohorts
    .filter(
      (c) => c.cohortStart >= addDays(r.from, -6) && c.cohortStart <= r.to,
    )
    .map((c) => {
      const week = { from: c.cohortStart, to: addDays(c.cohortStart, 6) };
      const spend = [...spendByDay(payload, week).values()].reduce(
        (a, b) => a + b,
        0,
      );
      return {
        ...c,
        spend,
        roas: {
          d0: ratio(c.revenue.d0, spend),
          d7: ratio(c.revenue.d7, spend),
          d30: ratio(c.revenue.d30, spend),
          lifetime: ratio(c.revenue.lifetime, spend),
        },
      };
    })
    .sort((a, b) => (a.cohortStart < b.cohortStart ? 1 : -1));

  const keys = ["d0", "d7", "d30", "lifetime"] as const;
  const zero = () => ({ d0: 0, d7: 0, d30: 0, lifetime: 0 });
  const revenue = zero();
  const spendAt = zero();
  const sizeAt = zero();
  for (const row of rows) {
    for (const k of keys) {
      const reached =
        k === "lifetime"
          ? row.revenue.lifetime !== null
          : row.complete[k] && row.revenue[k] !== null;
      if (!reached) continue;
      revenue[k] += row.revenue[k] ?? 0;
      spendAt[k] += row.spend;
      sizeAt[k] += row.size;
    }
  }
  const pick = (f: (k: (typeof keys)[number]) => number | null) =>
    Object.fromEntries(keys.map((k) => [k, f(k)])) as Record<
      (typeof keys)[number],
      number | null
    >;
  return {
    rows,
    totals: {
      size: rows.reduce((n, c) => n + c.size, 0),
      spend: rows.reduce((n, c) => n + c.spend, 0),
      revenue,
      spendAt,
      sizeAt,
      roas: pick((k) => ratio(revenue[k], spendAt[k])),
      perCustomer: pick((k) => ratio(revenue[k], sizeAt[k])),
    },
  };
}

/* ------------------------------------------------------------- chart -- */

export interface ChartPoint {
  /** First day of the bucket. */
  day: string;
  label: string;
  revenue: number;
  spend: number;
  dau: number | null;
  newUsers: number;
  installs: number;
}

const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * Daily points, or past 92 days one point per week (Sunday to Saturday, like
 * the cohorts) holding the average day of that week - a week cut by the range
 * or still running then does not look like a drop.
 */
export function chartPoints(
  payload: PerfPayload,
  r: Range,
): { points: ChartPoint[]; weekly: boolean } {
  const s = new Series(payload.series);
  const spend = spendByDay(payload, r);
  const days = daysOf(r);
  const weekly = days.length > 92;
  const buckets: string[][] = [];
  for (const d of days) {
    const sunday = new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
    const current = buckets.at(-1);
    if (!current || !weekly || sunday) buckets.push([d]);
    else current.push(d);
  }
  const points: ChartPoint[] = [];
  for (const bucket of buckets) {
    const start = bucket[0];
    const end = bucket.at(-1);
    if (!start || !end) continue;
    const range = { from: start, to: end };
    const n = bucket.length;
    const label = DAY_LABEL.format(new Date(`${start}T00:00:00Z`));
    points.push({
      day: start,
      label: weekly ? `sem. du ${label}` : label,
      revenue: s.sum("revenuecat:revenue", range) / n,
      spend: bucket.reduce((sum, d) => sum + (spend.get(d) ?? 0), 0) / n,
      dau: s.avg("amplitude:dau", range),
      newUsers: s.sum("amplitude:new_users", range) / n,
      installs: s.sum("appsflyer:installs", range) / n,
    });
  }
  return { points, weekly };
}

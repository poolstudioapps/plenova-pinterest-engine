/**
 * The Performances figures for any period, computed in the browser from the
 * daily series stored by lib/performance/refresh.ts - so switching between 7,
 * 30, 60 days, "since the start" or dates picked in the calendar is instant.
 * No server import here: this module ships to the client.
 *
 * Days are UTC days (YYYY-MM-DD), ranges include both ends.
 */

import type { LtvInputs, SubscriberUsageMonth } from "@/lib/performance/ltv";

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
  /** The store the campaign targeted, null for both. */
  platform: "ios" | "android" | null;
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
  /** Something the last good reading could not do, without failing (AppsFlyer's events). */
  warning: string | null;
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
    /** What the projected LTV per paying customer is computed from (lib/performance/ltv.ts). */
    ltvInputs: LtvInputs | null;
  } | null;
  /** The app versions the conversion figures count, e.g. "2.0.0" or "2.0.0 → 2.1.0". */
  conversionVersions: string | null;
  /** Subscribers still using the app month after month (Amplitude), by plan. */
  subscriberUsage: Record<
    "monthly" | "annual",
    SubscriberUsageMonth[] | null
  > | null;
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

/**
 * A real calendar day: 2026-02-30 is refused rather than rolled over to March,
 * and 2026-13-01 is refused rather than thrown on (toISOString of an invalid
 * date throws).
 */
export function isCalendarDay(d: string): boolean {
  const ms = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().startsWith(d);
}

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

/** A store, or both: the AppsFlyer section's filter. */
export type Os = "all" | "ios" | "android";
export const STORES = ["ios", "android"] as const;

/**
 * Spend per day: AppsFlyer's cost plus the entries typed in, spread evenly
 * over their days. For one store, its own cost and the entries that name it
 * only - an entry for both stores says nothing of how it split.
 */
export function spendByDay(
  payload: PerfPayload,
  r: Range,
  os: Os = "all",
): Map<string, number> {
  const out = new Map<string, number>();
  const cost =
    payload.series[os === "all" ? "appsflyer:cost" : `appsflyer:cost_${os}`] ??
    {};
  for (const d of daysOf(r)) out.set(d, cost[d] ?? 0);
  for (const e of payload.spend) {
    if (os !== "all" && e.platform !== os) continue;
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

export const ratio = (a: number | null, b: number | null) =>
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
  purchase7Rate: number | null;
  purchase7Done: number;
  purchase7Start: number;
  buyers: number;
  /** Buyers ÷ new users, both of the counted app versions. */
  buyersRate: number | null;
  newUsersV2: number;
  // Unit economics
  arpuMonthly: number | null;
  arppuMonthly: number | null;
  has: {
    revenuecat: boolean;
    amplitude: boolean;
    appsflyer: boolean;
    /** Any new user of the counted app versions in the range. */
    conversion: boolean;
  };
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

  // Conversion: app MIN_APP_VERSION and later only (lib/performance/versions.ts).
  const onboardingStart = s.sum("amplitude:onboarding_v2_start", r);
  const onboardingDone = s.sum("amplitude:onboarding_v2_done", r);
  const purchase7Start = s.sum("amplitude:purchase_7d_v2_start", r);
  const purchase7Done = s.sum("amplitude:purchase_7d_v2_done", r);
  const newUsers = s.sum("amplitude:new_users", r);
  const buyers = s.sum("amplitude:buyers_v2", r);
  const newUsersV2 = s.sum("amplitude:new_users_v2", r);
  const paying7Base = s.sum("revenuecat:conv_new_customers_v2", r);
  const paying7 = s.sum("revenuecat:conv_paying_7d_v2", r);
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
    purchase7Rate: ratio(purchase7Done, purchase7Start),
    purchase7Done,
    purchase7Start,
    buyers,
    buyersRate: ratio(buyers, newUsersV2),
    newUsersV2,
    arpuMonthly: ratio(monthlyRevenue, avgMau),
    arppuMonthly: ratio(monthlyRevenue, avgActives),
    has: {
      revenuecat: s.has("revenuecat:revenue", r),
      amplitude: s.has("amplitude:dau", r),
      appsflyer: s.has("appsflyer:installs", r),
      conversion: newUsersV2 > 0 || paying7Base > 0,
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

/* ------------------------------------------------------------ trends -- */

/**
 * One series over the range, for the small trend line of a KPI tile: the
 * value of each day (null where there is none), or past 92 days the average
 * day of each week, like the chart - a 7-month sparkline of 200 points is
 * noise at that size.
 */
export function trend(
  payload: PerfPayload,
  key: string,
  r: Range,
): (number | null)[] {
  const s = new Series(payload.series);
  const days = daysOf(r);
  if (days.length <= 92) return days.map((d) => s.avg(key, { from: d, to: d }));
  const out: (number | null)[] = [];
  let week: string[] = [];
  const flush = () => {
    const start = week[0];
    const end = week.at(-1);
    if (start && end) out.push(s.avg(key, { from: start, to: end }));
    week = [];
  };
  for (const d of days) {
    if (week.length && new Date(`${d}T00:00:00Z`).getUTCDay() === 0) flush();
    week.push(d);
  }
  flush();
  return out;
}

/* ------------------------------------------------------------- chart -- */

export interface Buckets {
  /** One point per week (Sunday to Saturday) rather than per day. */
  weekly: boolean;
  ranges: Range[];
  labels: string[];
}

const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * The points of a chart over the range: one per day, or past 92 days one per
 * week (Sunday to Saturday, like the cohorts) - 200 daily points are noise at
 * that width. A week cut by the range or still running is its own shorter
 * bucket, so values meant per day are averaged over its days, not summed.
 */
export function buckets(r: Range): Buckets {
  const days = daysOf(r);
  const weekly = days.length > 92;
  const groups: string[][] = [];
  for (const d of days) {
    const sunday = new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
    const current = groups.at(-1);
    if (!current || !weekly || sunday) groups.push([d]);
    else current.push(d);
  }
  const ranges: Range[] = [];
  const labels: string[] = [];
  for (const g of groups) {
    const from = g[0];
    const to = g.at(-1);
    if (!from || !to) continue;
    ranges.push({ from, to });
    const label = DAY_LABEL.format(new Date(`${from}T00:00:00Z`));
    labels.push(weekly ? `sem. du ${label}` : label);
  }
  return { weekly, ranges, labels };
}

/** One value per bucket; `days` is the bucket's length, to turn a sum into a day's average. */
export function over(
  b: Buckets,
  value: (range: Range, days: number) => number | null,
): (number | null)[] {
  return b.ranges.map((range) => value(range, dayCount(range)));
}

/* --------------------------------------------------------- appsflyer -- */

/** An AppsFlyer metric (stored per store as `${metric}_ios`...) over a range, for one store or both. */
export function afSum(s: Series, metric: string, os: Os, r: Range): number {
  return os === "all"
    ? STORES.reduce((n, p) => n + s.sum(`appsflyer:${metric}_${p}`, r), 0)
    : s.sum(`appsflyer:${metric}_${os}`, r);
}

/** The purchases AppsFlyer saw: annual, monthly and one-time offer together. */
export function afPurchases(s: Series, os: Os, r: Range): number {
  return (
    afSum(s, "purchases_annual", os, r) +
    afSum(s, "purchases_monthly", os, r) +
    afSum(s, "purchases_oto", os, r)
  );
}

/**
 * The first day AppsFlyer's in-app events were read for: days stored before
 * (installs loaded on their own) have no purchases, and counting them as zero
 * would sink every rate.
 */
export function afEventsFrom(payload: PerfPayload): string | null {
  const days = Object.keys(payload.series["appsflyer:first_plant_ios"] ?? {});
  return days.length ? days.reduce((a, b) => (a < b ? a : b)) : null;
}

/** The part of a range that has AppsFlyer events, or null if none of it has. */
export function eventsRange(r: Range, eventsFrom: string | null): Range | null {
  if (!eventsFrom || eventsFrom > r.to) return null;
  return eventsFrom > r.from ? { from: eventsFrom, to: r.to } : r;
}

export interface AfKpis {
  installs: number;
  organic: number;
  paid: number;
  /** Over the part of the range that has events (see eventsRange). */
  purchases: number | null;
  purchasesAnnual: number | null;
  purchasesMonthly: number | null;
  purchasesOto: number | null;
  purchasesPaid: number | null;
  /** First plant added: the app's activation. */
  activations: number | null;
  /** Installs over the same days as the events, for the rates. */
  eventInstalls: number;
  activationRate: number | null;
  purchaseRate: number | null;
  spend: number;
  /** For one store: the typed spend that names no store, left out of its costs. */
  untagged: number;
  cpi: number | null;
  /** Spend ÷ installs from campaigns only. */
  cpiPaid: number | null;
  cpa: number | null;
  cpaPaid: number | null;
  costPerActivation: number | null;
  has: boolean;
  /** The events cover only part of the range (or none of it). */
  eventsPartial: boolean;
  eventsFrom: string | null;
}

export function afKpis(payload: PerfPayload, r: Range, os: Os): AfKpis {
  const s = new Series(payload.series);
  const eventsFrom = afEventsFrom(payload);
  const ev = eventsRange(r, eventsFrom);
  const spendOf = (range: Range) =>
    [...spendByDay(payload, range, os).values()].reduce((a, b) => a + b, 0);
  const installs = afSum(s, "installs", os, r);
  const paid = afSum(s, "installs_paid", os, r);
  const spend = spendOf(r);
  const eventInstalls = ev ? afSum(s, "installs", os, ev) : 0;
  const eventSpend = ev ? spendOf(ev) : 0;
  const on = (metric: string) => (ev ? afSum(s, metric, os, ev) : null);
  const purchases = ev ? afPurchases(s, os, ev) : null;
  const purchasesPaid = on("purchases_paid");
  const activations = on("first_plant");
  let untagged = 0;
  if (os !== "all") {
    for (const e of payload.spend) {
      if (e.platform !== null) continue;
      const from = e.from > r.from ? e.from : r.from;
      const to = e.to < r.to ? e.to : r.to;
      if (from > to) continue;
      untagged +=
        (e.amount / dayCount({ from: e.from, to: e.to })) *
        dayCount({ from, to });
    }
  }
  return {
    installs,
    organic: afSum(s, "installs_organic", os, r),
    paid,
    purchases,
    purchasesAnnual: on("purchases_annual"),
    purchasesMonthly: on("purchases_monthly"),
    purchasesOto: on("purchases_oto"),
    purchasesPaid,
    activations,
    eventInstalls,
    activationRate: ratio(activations, eventInstalls),
    purchaseRate: ratio(purchases, eventInstalls),
    spend,
    untagged,
    cpi: ratio(spend, installs),
    cpiPaid: ratio(spend, paid),
    cpa: ratio(eventSpend, purchases),
    cpaPaid: ratio(eventSpend, purchasesPaid),
    costPerActivation: ratio(eventSpend, activations),
    has: STORES.some((p) => s.has(`appsflyer:installs_${p}`, r)),
    eventsPartial: ev === null || ev.from !== r.from,
    eventsFrom,
  };
}

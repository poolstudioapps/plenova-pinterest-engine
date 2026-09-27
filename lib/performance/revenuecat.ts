import "server-only";
import { config } from "@/lib/config";
import { getJson, sleep, utcDay } from "@/lib/performance/http";
import type { DailyPoint } from "@/lib/performance/store";

/**
 * RevenueCat, the source of truth for money: revenue, MRR, subscribers,
 * churn, conversion to paying, refunds, realized and predicted LTV, and the
 * revenue of each weekly cohort of new customers at D0 / D7 / D30 / to date (for
 * the cohort ROAS). API v2 with a read-only "Charts & metrics" key.
 *
 * Revenue is RevenueCat's "Revenue": gross, customer price including VAT,
 * refunds of the period taken off. Days and weeks are UTC; weeks start on
 * Sunday. Charts allow 25 calls a minute: calls go one by one, spaced out.
 */

const API = "https://api.revenuecat.com/v2";
const SPACING_MS = 2600;

interface ChartValue {
  cohort: number;
  measure?: number;
  period?: number;
  value: number | null;
  incomplete?: boolean;
  segment?: number;
}
interface Chart {
  values?: (ChartValue | (number | null)[])[];
  measures?: { display_name?: string }[] | null;
  periods?: { display_name?: string }[] | null;
  segments?: { display_name?: string }[] | null;
}

export interface RcMonthRow {
  month: string;
  incomplete: boolean;
  [key: string]: string | number | boolean | null;
}

export interface RevenueCatData {
  currency: string;
  overview: {
    mrr: number | null;
    revenue28: number | null;
    activeSubscriptions: number | null;
    activeTrials: number | null;
    newCustomers28: number | null;
    activeUsers28: number | null;
  };
  /** Subscription churn by month: rate in %, churned and actives at the start. */
  churn: RcMonthRow[];
  /** Realized LTV by first-seen month (ARPU = per customer, ARPPU = per paying customer). */
  ltv: RcMonthRow[];
  ltvOverall: {
    perCustomer: number | null;
    perPayingCustomer: number | null;
    revenue: number | null;
    customers: number | null;
  };
  /** RevenueCat's predicted LTV per customer, 12 and 24 months after first seen. */
  prediction: {
    m12: number | null;
    m24: number | null;
    cohorts: {
      month: string;
      size: number;
      m12: number | null;
      m24: number | null;
    }[];
  };
}

export interface RevenueCatCohort {
  /** The Sunday (UTC) the week of new customers starts. */
  cohortStart: string;
  size: number;
  /** Revenue per customer by day N of age (null until the cohort got there). */
  perCustomer: {
    d0: number | null;
    d7: number | null;
    d30: number | null;
    lifetime: number | null;
  };
  /** The cohort's revenue at day N and to date (size x per customer). */
  revenue: {
    d0: number | null;
    d7: number | null;
    d30: number | null;
    lifetime: number | null;
  };
  /** Whether every customer of the week has reached day N. */
  complete: { d0: boolean; d7: boolean; d30: boolean };
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${config.revenuecat.apiKey}` };
}

function project(): string {
  const id = config.revenuecat.projectId;
  if (!/^proj[a-z0-9]+$/i.test(id))
    throw new Error("REVENUECAT_PROJECT_ID invalide");
  return id;
}

async function chart(
  name: string,
  resolution: number,
  start: string,
  end: string,
  selectors?: Record<string, string>,
): Promise<Chart> {
  const params = new URLSearchParams({
    resolution: String(resolution),
    start_date: start,
    end_date: end,
    currency: "EUR",
  });
  if (selectors) params.set("selectors", JSON.stringify(selectors));
  const data = await getJson<Chart>(
    "RevenueCat",
    `${API}/projects/${project()}/charts/${name}?${params}`,
    headers(),
  );
  await sleep(SPACING_MS);
  return data;
}

/**
 * The index of a measure by its name (the order is not guaranteed), with the
 * index seen on 2026-09-27 as a fallback. Names carry suffixes such as
 * "(7 days)" or "(Unbounded)", hence patterns.
 */
function measureIndex(
  chartData: Chart,
  name: RegExp,
  fallback: number,
): number {
  const i = (chartData.measures ?? []).findIndex((m) =>
    name.test((m.display_name ?? "").trim()),
  );
  return i >= 0 ? i : fallback;
}

/** Values of one measure, keyed by cohort (unix seconds). Segmented rows are left out. */
function series(
  chartData: Chart,
  measure: number,
): Map<number, { value: number | null; incomplete: boolean }> {
  const out = new Map<number, { value: number | null; incomplete: boolean }>();
  for (const v of chartData.values ?? []) {
    if (Array.isArray(v) || v.segment !== undefined) continue;
    if ((v.measure ?? 0) !== measure) continue;
    out.set(v.cohort, {
      value: typeof v.value === "number" ? v.value : null,
      incomplete: v.incomplete === true,
    });
  }
  return out;
}

const dayOf = (seconds: number) => utcDay(new Date(seconds * 1000));

function monthsAgoStart(n: number): string {
  const d = new Date();
  return utcDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)));
}

const addDays = (day: string, n: number) =>
  utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));

/** The Sunday (UTC) starting the week of `day` - RevenueCat's weeks start on Sunday. */
function sundayOnOrBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return utcDay(
    new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate() - d.getUTCDay(),
      ),
    ),
  );
}

function monthRows(
  chartData: Chart,
  fields: Record<string, number>,
): RcMonthRow[] {
  const maps = Object.fromEntries(
    Object.entries(fields).map(([k, i]) => [k, series(chartData, i)]),
  );
  const cohorts = new Set<number>();
  for (const m of Object.values(maps)) for (const c of m.keys()) cohorts.add(c);
  return [...cohorts]
    .sort((a, b) => a - b)
    .map((c) => {
      const row: RcMonthRow = { month: dayOf(c), incomplete: false };
      for (const [k, m] of Object.entries(maps)) {
        const cell = m.get(c);
        row[k] = cell?.value ?? null;
        if (cell?.incomplete) row.incomplete = true;
      }
      return row;
    });
}

export function revenueCatConfigured(): boolean {
  return Boolean(config.revenuecat.apiKey);
}

/**
 * `since` is where the daily series start: the app's first day on a full
 * sync, the last weeks otherwise (stored days are upserted, so older ones stay).
 */
export async function fetchRevenueCat(
  since: string,
  epoch: string,
): Promise<{
  data: RevenueCatData;
  daily: DailyPoint[];
  cohorts: RevenueCatCohort[];
}> {
  const today = utcDay(new Date());
  const sixMonths = monthsAgoStart(6);
  const daily: DailyPoint[] = [];
  const push = (metric: string, map: Map<number, { value: number | null }>) => {
    for (const [c, cell] of map)
      if (cell.value !== null)
        daily.push({
          day: dayOf(c),
          source: "revenuecat",
          metric,
          value: cell.value,
        });
  };

  // 1. The headline figures.
  const overviewRes = await getJson<{
    currency?: string;
    metrics?: { id?: string; value?: number }[];
  }>(
    "RevenueCat",
    `${API}/projects/${project()}/metrics/overview?currency=EUR`,
    headers(),
  );
  await sleep(SPACING_MS);
  const pick = (id: string) => {
    const v = Number(overviewRes.metrics?.find((m) => m.id === id)?.value);
    return Number.isFinite(v) ? v : null;
  };

  // 2. Daily series: revenue and transactions, MRR, active subscriptions, new customers.
  const revenue = await chart("revenue", 0, since, today, {
    revenue_type: "revenue",
  });
  push("revenue", series(revenue, measureIndex(revenue, /^revenue$/i, 0)));
  push(
    "transactions",
    series(revenue, measureIndex(revenue, /^transactions$/i, 1)),
  );
  const mrr = await chart("mrr", 0, since, today);
  push("mrr", series(mrr, measureIndex(mrr, /^mrr$/i, 0)));
  const actives = await chart("actives", 0, since, today);
  push(
    "actives",
    series(actives, measureIndex(actives, /^actives?( subscriptions)?$/i, 0)),
  );
  const customersNew = await chart("customers_new", 0, since, today);
  push(
    "new_customers",
    series(customersNew, measureIndex(customersNew, /^new customers$/i, 0)),
  );

  // 3. Daily counts behind the rates, so any period can be computed: new
  // customers and those paying within 7 days, subscriptions at the start of
  // the day and those churned, transactions and those refunded.
  const conversionChart = await chart("conversion_to_paying", 0, since, today, {
    conversion_timeframe: "7_days",
  });
  push(
    "conv_new_customers",
    series(
      conversionChart,
      measureIndex(conversionChart, /^new customers$/i, 0),
    ),
  );
  push(
    "conv_paying_7d",
    series(
      conversionChart,
      measureIndex(conversionChart, /^paying customers/i, 1),
    ),
  );
  const churnDaily = await chart("churn", 0, since, today);
  push(
    "churn_actives",
    series(churnDaily, measureIndex(churnDaily, /^actives$/i, 0)),
  );
  push(
    "churn_churned",
    series(churnDaily, measureIndex(churnDaily, /^churned actives$/i, 1)),
  );
  const refundChart = await chart("refund_rate", 0, since, today);
  push(
    "refund_transactions",
    series(refundChart, measureIndex(refundChart, /^transactions$/i, 0)),
  );
  push(
    "refund_refunded",
    series(
      refundChart,
      measureIndex(refundChart, /^refunded transactions$/i, 1),
    ),
  );

  // Monthly churn as RevenueCat reports it, for the "last full month" figure.
  const churnChart = await chart("churn", 2, sixMonths, today);
  const churn = monthRows(churnChart, {
    actives: measureIndex(churnChart, /^actives$/i, 0),
    churned: measureIndex(churnChart, /^churned actives$/i, 1),
    rate: measureIndex(churnChart, /^churn rate$/i, 2),
  });

  // 4. Realized LTV since the start, by first-seen month.
  const ltvChart = await chart(
    "ltv_per_customer",
    2,
    monthsAgoStart(24),
    today,
    { customer_lifetime: "unbounded" },
  );
  const payingChart = await chart(
    "ltv_per_paying_customer",
    2,
    monthsAgoStart(24),
    today,
    { customer_lifetime: "unbounded" },
  );
  const ltvRows = monthRows(ltvChart, {
    customers: measureIndex(ltvChart, /^new customers$/i, 0),
    revenue: measureIndex(ltvChart, /^realized ltv( \(unbounded\))?$/i, 1),
    perCustomer: measureIndex(ltvChart, /\/ ?customer/i, 3),
  });
  const payingRows = monthRows(payingChart, {
    paying: measureIndex(payingChart, /^new paying customers/i, 0),
    perPaying: measureIndex(payingChart, /\/ ?paying customer/i, 2),
  });
  const ltv = ltvRows.map((r) => ({
    ...r,
    ...(payingRows.find((p) => p.month === r.month) ?? {}),
    month: r.month,
    incomplete: r.incomplete,
  }));
  const sum = (rows: RcMonthRow[], key: string) =>
    rows.reduce(
      (n, r) => n + (typeof r[key] === "number" ? (r[key] as number) : 0),
      0,
    );
  const lifetimeRevenue = sum(ltvRows, "revenue");
  const lifetimeCustomers = sum(ltvRows, "customers");
  const lifetimePaying = sum(payingRows, "paying");

  // 5. Predicted LTV per customer at 12 and 24 months, by first-seen month (rows: [cohort, size, M0..M24]).
  const predictionChart = await chart(
    "prediction_explorer",
    2,
    sixMonths,
    today,
    {
      cohorting_date: "first_seen_date",
      measure: "predicted_ltv_per_customer",
      period_resolution: "month",
    },
  );
  const predictionCohorts = (predictionChart.values ?? [])
    .filter(
      (row): row is (number | null)[] =>
        Array.isArray(row) && typeof row[0] === "number",
    )
    .map((row) => ({
      month: dayOf(row[0] as number),
      size: Number(row[1]) || 0,
      m12: typeof row[2 + 12] === "number" ? (row[2 + 12] as number) : null,
      m24: typeof row[2 + 24] === "number" ? (row[2 + 24] as number) : null,
    }));
  const weighted = (key: "m12" | "m24") => {
    const usable = predictionCohorts.filter(
      (c) => c[key] !== null && c.size > 0,
    );
    const size = usable.reduce((n, c) => n + c.size, 0);
    return size > 0
      ? usable.reduce((n, c) => n + (c[key] as number) * c.size, 0) / size
      : null;
  };

  // 6. Weekly cohorts of new customers (RevenueCat's default cohorting, by
  // install): revenue per customer at each day of age. "To date" is the last
  // day the chart reaches, from the same chart, so every column shares one
  // definition of the cohort and its size.
  const cohortStart = sundayOnOrBefore(epoch);
  const explorer = await chart("cohort_explorer", 1, cohortStart, today, {
    cohorting_date: "customer_installed_at",
    measure: "realized_ltv_per_customer",
    period_resolution: "day",
  });
  // periods[k] is "New customers" (k = 0) or "Day N" (k >= 1).
  const periodDay = (k: number): number | null => {
    const label =
      explorer.periods?.[k]?.display_name ??
      (k === 0 ? "New customers" : `Day ${k - 1}`);
    const m = /day\s+(\d+)/i.exec(label);
    return m ? Number(m[1]) : null;
  };
  const byCohort = new Map<
    number,
    {
      size: number;
      days: Map<number, { value: number | null; incomplete: boolean }>;
    }
  >();
  for (const v of explorer.values ?? []) {
    if (Array.isArray(v) || typeof v.period !== "number") continue;
    const entry = byCohort.get(v.cohort) ?? { size: 0, days: new Map() };
    if (v.period === 0) entry.size = Number(v.value) || 0;
    else {
      const day = periodDay(v.period);
      if (day !== null)
        entry.days.set(day, {
          value: typeof v.value === "number" ? v.value : null,
          incomplete: v.incomplete === true,
        });
    }
    byCohort.set(v.cohort, entry);
  }
  const cohorts: RevenueCatCohort[] = [...byCohort.entries()]
    .sort(([a], [b]) => b - a)
    .map(([c, entry]) => {
      const start = dayOf(c);
      const per = (d: number) => entry.days.get(d)?.value ?? null;
      const total = (v: number | null) =>
        v === null ? null : Math.round(v * entry.size * 100) / 100;
      const lastDay = Math.max(-1, ...entry.days.keys());
      const toDate = lastDay >= 0 ? per(lastDay) : null;
      // Complete at day N once the week's last customer (Saturday) is N days
      // old, whatever the chart's own flag says - it is optional.
      const reached = (d: number) =>
        addDays(start, 6 + d) < today &&
        entry.days.has(d) &&
        entry.days.get(d)?.incomplete !== true;
      return {
        cohortStart: start,
        size: entry.size,
        perCustomer: { d0: per(0), d7: per(7), d30: per(30), lifetime: toDate },
        revenue: {
          d0: total(per(0)),
          d7: total(per(7)),
          d30: total(per(30)),
          lifetime: total(toDate),
        },
        complete: { d0: reached(0), d7: reached(7), d30: reached(30) },
      };
    });

  return {
    data: {
      currency:
        typeof overviewRes.currency === "string" ? overviewRes.currency : "EUR",
      overview: {
        mrr: pick("mrr"),
        revenue28: pick("revenue"),
        activeSubscriptions: pick("active_subscriptions"),
        activeTrials: pick("active_trials"),
        newCustomers28: pick("new_customers"),
        activeUsers28: pick("active_users"),
      },
      churn,
      ltv,
      ltvOverall: {
        perCustomer:
          lifetimeCustomers > 0 ? lifetimeRevenue / lifetimeCustomers : null,
        perPayingCustomer:
          lifetimePaying > 0 ? lifetimeRevenue / lifetimePaying : null,
        revenue: lifetimeRevenue || null,
        customers: lifetimeCustomers || null,
      },
      prediction: {
        m12: weighted("m12"),
        m24: weighted("m24"),
        cohorts: predictionCohorts,
      },
    },
    daily,
    cohorts,
  };
}

import "server-only";
import { config } from "@/lib/config";
import { daysAgo, getJson, sleep, utcDay, VendorError } from "@/lib/performance/http";
import type { LtvInputs, LtvPlan } from "@/lib/performance/ltv";
import type { DailyPoint } from "@/lib/performance/store";
import { compareVersions, countedVersion } from "@/lib/performance/versions";

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
  segments?: { display_name?: string; is_total?: boolean }[] | null;
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
  /** What the projected LTV per paying customer is computed from (lib/performance/ltv.ts). */
  ltvInputs: LtvInputs;
  /** The app versions RevenueCat's paying conversion counted (MIN_APP_VERSION and later). */
  conversionVersions: string[];
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

/** A chart filter, e.g. { name: "product_duration", values: ["P1M"] }. */
interface ChartFilter {
  name: string;
  values: string[];
}

type AppFilterKind = "app_id" | "first_app_id" | "store";

/**
 * How each chart takes "the Plenova apps only": RevenueCat names that filter
 * per chart (checked 2026-09-27) - app_id for money and subscriptions,
 * first_app_id for charts of customers, store for the LTV charts. Charts not
 * listed start with app_id; when RevenueCat refuses that very filter, the
 * next kind is tried. A chart none of them fits fails loudly: the Test Store
 * is never counted in silence.
 */
const APP_FILTER_BY_CHART: Record<string, AppFilterKind> = {
  customers_new: "first_app_id",
  conversion_to_paying: "first_app_id",
  ltv_per_customer: "store",
  ltv_per_paying_customer: "store",
};
const learnedFilter = new Map<string, AppFilterKind>();

function appFilter(kind: AppFilterKind): ChartFilter {
  const values =
    kind === "store"
      ? config.revenuecat.stores.filter((s) => /^[a-z_]+$/.test(s))
      : config.revenuecat.appIds.filter((id) => /^app[0-9a-f]+$/i.test(id));
  if (values.length === 0) {
    throw new Error(kind === "store" ? "REVENUECAT_STORES est vide" : "REVENUECAT_APP_IDS est vide");
  }
  return { name: kind, values };
}

/**
 * One RevenueCat chart, limited to the Plenova apps (App Store, Play Store)
 * so the project's Test Store never counts. `segment` splits it (by
 * product_duration, first_app_version...).
 */
async function chart(
  name: string,
  resolution: number,
  start: string,
  end: string,
  selectors?: Record<string, string>,
  extra: { filters?: ChartFilter[]; segment?: string } = {},
): Promise<Chart> {
  const first = learnedFilter.get(name) ?? APP_FILTER_BY_CHART[name] ?? "app_id";
  const kinds = [...new Set<AppFilterKind>([first, "app_id", "first_app_id", "store"])];
  let lastError: unknown = null;
  for (const kind of kinds) {
    const params = new URLSearchParams({
      resolution: String(resolution),
      start_date: start,
      end_date: end,
      currency: "EUR",
    });
    if (selectors) params.set("selectors", JSON.stringify(selectors));
    params.set("filters", JSON.stringify([appFilter(kind), ...(extra.filters ?? [])]));
    if (extra.segment) params.set("segment", extra.segment);
    try {
      const data = await getJson<Chart>(
        "RevenueCat",
        `${API}/projects/${project()}/charts/${name}?${params}`,
        headers(),
      );
      learnedFilter.set(name, kind);
      await sleep(SPACING_MS);
      return data;
    } catch (err) {
      await sleep(SPACING_MS);
      // Only a refusal of the app filter itself moves on to the next kind;
      // any other error (another filter, the network) stops here.
      const refused =
        err instanceof VendorError &&
        err.status === 400 &&
        new RegExp(`invalid filter: *${kind}(?![a-z_])`, "i").test(err.message);
      if (!refused) throw err;
      lastError = err;
    }
  }
  throw new Error(
    `RevenueCat ${name} : aucun filtre d'app accepté (${lastError instanceof Error ? lastError.message : "?"})`,
  );
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

/**
 * One measure of a segmented chart, summed per cohort over the segments
 * `keep` accepts (by label; `isTotal` marks RevenueCat's own total row,
 * found by its name: some charts flag their first real segment as the total).
 * A cohort where no kept segment has a value is left out.
 */
function segmentSum(
  chartData: Chart,
  measure: number,
  keep: (label: string, isTotal: boolean) => boolean,
): Map<number, { value: number | null; incomplete: boolean }> {
  const kept = new Set<number>();
  (chartData.segments ?? []).forEach((seg, i) => {
    const label = seg.display_name ?? "";
    if (keep(label, label === "Total")) kept.add(i);
  });
  const out = new Map<number, { value: number | null; incomplete: boolean }>();
  for (const v of chartData.values ?? []) {
    if (Array.isArray(v) || v.segment === undefined || !kept.has(v.segment))
      continue;
    if ((v.measure ?? 0) !== measure || typeof v.value !== "number") continue;
    const prev = out.get(v.cohort);
    out.set(v.cohort, {
      value: (prev?.value ?? 0) + v.value,
      incomplete: (prev?.incomplete ?? false) || v.incomplete === true,
    });
  }
  return out;
}

const dayOf = (seconds: number) => utcDay(new Date(seconds * 1000));

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** RevenueCat's expiration month label ("Sep '26") as YYYY-MM, or null. */
function expirationMonth(label: string): string | null {
  const m = /^([A-Za-z]{3})\S*\s*'(\d{2})$/.exec(label.trim());
  const index = m
    ? MONTHS.indexOf(
        `${m[1]?.[0]?.toUpperCase()}${m[1]?.slice(1).toLowerCase()}`,
      )
    : -1;
  return m && index >= 0
    ? `20${m[2]}-${String(index + 1).padStart(2, "0")}`
    : null;
}

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
  knownVersions: string[] = [],
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
  // New customers and those paying within 7 days: every version, then app
  // MIN_APP_VERSION and later. A split by version keeps only the 10 biggest
  // versions of the range ("Other" for the rest), so the counted versions
  // are found on the last 60 days - merged with those already known, so a
  // version never drops out - and the figures asked with an explicit filter.
  const conversionChart = await chart("conversion_to_paying", 0, since, today, {
    conversion_timeframe: "7_days",
  });
  push("conv_new_customers", series(conversionChart, measureIndex(conversionChart, /^new customers$/i, 0)));
  push("conv_paying_7d", series(conversionChart, measureIndex(conversionChart, /^paying customers/i, 1)));
  const versionChart = await chart(
    "conversion_to_paying",
    4,
    daysAgo(60),
    today,
    { conversion_timeframe: "7_days" },
    { segment: "first_app_version" },
  );
  const conversionVersions = [
    ...new Set([
      ...knownVersions.filter(countedVersion),
      ...(versionChart.segments ?? []).map((sg) => (sg.display_name ?? "").trim()).filter(countedVersion),
    ]),
  ].sort(compareVersions);
  if (conversionVersions.length > 0) {
    const v2Chart = await chart(
      "conversion_to_paying",
      0,
      since,
      today,
      { conversion_timeframe: "7_days" },
      { filters: [{ name: "first_app_version", values: conversionVersions }] },
    );
    push("conv_new_customers_v2", series(v2Chart, measureIndex(v2Chart, /^new customers$/i, 0)));
    push("conv_paying_7d_v2", series(v2Chart, measureIndex(v2Chart, /^paying customers/i, 1)));
  }
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

  // 4. What the projected LTV per paying customer needs (lib/performance/ltv.ts):
  // payments and money by plan duration, the plan of first purchases, the
  // monthly subscriptions' renewals, and the paying customers so far.
  const bySplit = (chartData: Chart, measure: number) => {
    const out = new Map<string, number>();
    const labels = (chartData.segments ?? []).map(
      (sg) =>
        // By name: subscription_status flags its first real segment is_total.
        sg.display_name ?? "",
    );
    for (const v of chartData.values ?? []) {
      if (
        Array.isArray(v) ||
        v.segment === undefined ||
        (v.measure ?? 0) !== measure
      )
        continue;
      if (typeof v.value !== "number") continue;
      const label = labels[v.segment] ?? "";
      out.set(label, (out.get(label) ?? 0) + v.value);
    }
    return out;
  };
  const byDuration = { segment: "product_duration" };
  const grossChart = await chart(
    "revenue",
    4,
    epoch,
    today,
    { revenue_type: "revenue" },
    byDuration,
  );
  const netChart = await chart(
    "revenue",
    4,
    epoch,
    today,
    { revenue_type: "proceeds" },
    byDuration,
  );
  // First payments alone (transaction type "New"): their own price, and the
  // plan mix of new payers (not resubscriptions or product changes, who
  // already paid once).
  const newOnly = {
    ...byDuration,
    filters: [{ name: "transaction_type", values: ["New"] }],
  };
  const firstGrossChart = await chart(
    "revenue",
    4,
    epoch,
    today,
    { revenue_type: "revenue" },
    newOnly,
  );
  const firstGross = bySplit(
    firstGrossChart,
    measureIndex(firstGrossChart, /^revenue$/i, 0),
  );
  const firstTransactions = bySplit(
    firstGrossChart,
    measureIndex(firstGrossChart, /^transactions$/i, 1),
  );
  const gross = bySplit(grossChart, measureIndex(grossChart, /^revenue$/i, 0));
  const transactions = bySplit(
    grossChart,
    measureIndex(grossChart, /^transactions$/i, 1),
  );
  const net = bySplit(netChart, measureIndex(netChart, /^proceeds$/i, 0));
  const plans: LtvPlan[] = [...transactions.keys()]
    .filter((label) => label !== "Total" && label !== "")
    .map((duration) => ({
      duration,
      gross: gross.get(duration) ?? 0,
      net: net.get(duration) ?? 0,
      transactions: transactions.get(duration) ?? 0,
      firstGross: firstGross.get(duration) ?? 0,
      firstTransactions: firstTransactions.get(duration) ?? 0,
    }))
    .filter((pl) => pl.transactions > 0);

  // Subscriptions coming to the end of their period, by plan and month of
  // expiration (RevenueCat gives the month, not the day): set to renew, set
  // to cancel, in billing trouble. Also the annual set-to-renew share.
  const expirations: LtvInputs["expirations"] = [];
  for (const plan of ["P1M", "P1Y"]) {
    const statusChart = await chart(
      "subscription_status",
      2,
      monthsAgoStart(0),
      today,
      undefined,
      {
        segment: "expiration_month",
        filters: [{ name: "product_duration", values: [plan] }],
      },
    );
    const read = (re: RegExp, fallback: number) =>
      bySplit(statusChart, measureIndex(statusChart, re, fallback));
    const active = read(/^total active subscriptions$/i, 0);
    const renew = read(/^active subscriptions set to renew$/i, 1);
    const cancel = read(/^active subscriptions set to cancel$/i, 2);
    const billing = read(/^active subscriptions billing issue$/i, 3);
    for (const [label, count] of active) {
      const month = expirationMonth(label);
      if (!month || count <= 0) continue;
      expirations.push({
        plan,
        month,
        active: count,
        renew: renew.get(label) ?? 0,
        cancel: cancel.get(label) ?? 0,
        billing: billing.get(label) ?? 0,
      });
    }
  }
  const annual = expirations.filter((e) => e.plan === "P1Y");
  const annualActive = annual.reduce((n, e) => n + e.active, 0);

  // Monthly subscriptions: periods alternate "Month N" (count, odd) and
  // "Month N rate" (%, even); period 0 is the number that started.
  const retentionChart = await chart(
    "subscription_retention",
    2,
    epoch,
    today,
    undefined,
    {
      filters: [{ name: "product_duration", values: ["P1M"] }],
    },
  );
  const retention = new Map<
    number,
    { size: number; months: Map<number, { count: number; complete: boolean }> }
  >();
  for (const v of retentionChart.values ?? []) {
    if (
      Array.isArray(v) ||
      typeof v.cohort !== "number" ||
      typeof v.period !== "number"
    )
      continue;
    if (typeof v.value !== "number") continue;
    const entry = retention.get(v.cohort) ?? { size: 0, months: new Map() };
    if (v.period === 0) entry.size = v.value;
    else if (v.period % 2 === 1)
      entry.months.set((v.period + 1) / 2, {
        count: v.value,
        complete: v.incomplete !== true,
      });
    retention.set(v.cohort, entry);
  }
  const monthlyRetention = [...retention.entries()]
    .sort(([x], [y]) => x - y)
    .map(([cohortTs, entry]) => ({
      cohort: dayOf(cohortTs),
      size: entry.size,
      months: [...entry.months.entries()]
        .sort(([x], [y]) => x - y)
        .map(([m, cell]) => ({ m, ...cell })),
    }));

  const payingChart = await chart("ltv_per_paying_customer", 2, epoch, today, {
    customer_lifetime: "unbounded",
  });
  const payers = [
    ...series(
      payingChart,
      measureIndex(payingChart, /^new paying customers/i, 0),
    ).values(),
  ].reduce((n, cell) => n + (cell.value ?? 0), 0);
  const ltvInputs: LtvInputs = {
    since: epoch,
    plans,
    monthlyRetention,
    annualRenewal:
      annualActive > 0
        ? {
            setToRenew: annual.reduce((n, e) => n + e.renew, 0),
            active: annualActive,
          }
        : null,
    expirations,
    realized: {
      gross: gross.get("Total") ?? 0,
      net: net.get("Total") ?? 0,
      payers,
    },
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
      ltvInputs,
      conversionVersions,
    },
    daily,
    cohorts,
  };
}

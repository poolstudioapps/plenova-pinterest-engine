import "server-only";
import { config } from "@/lib/config";
import { getText, sleep, utcDay } from "@/lib/performance/http";
import type { DailyPoint } from "@/lib/performance/store";

/**
 * AppsFlyer, from its aggregate report "partners by date" (Pull API aggregate
 * data, CSV, API token V2 in a Bearer header): per day of install and media
 * source, the installs, the cost AppsFlyer gets from the networks linked to it
 * (Meta's cost integration, mapped by the owners) and, for the app's in-app
 * events, how many of those users did each - counted here per UTC day and per
 * store (one app per store, so the app says the platform).
 *
 * The raw data reports are not in the account's plan (AppsFlyer said so on
 * 2026-09-27): everything comes from this one report, one call per app and
 * per year of range. Its events are by day of install (the users who
 * installed that day and later bought), so a day's purchases grow for a while:
 * the refresh re-reads the last weeks, and everything once a week.
 *
 * The quota counts per report, app and day from 00:00 UTC (24 calls a day per
 * app for ranges of 3 days or more): lib/performance/refresh.ts spaces the
 * reads, and after "Limit reached" waits for the next UTC day.
 */

const API = "https://hq1.appsflyer.com/api/agg-data/export/app";
/** One call covers a year at most; history is kept 25 months. */
const CHUNK_DAYS = 365;
const SPACING_MS = 1500;

/** The in-app events the page shows, and the metric each counts into. */
const EVENTS: Record<string, string> = {
  af_purchase_annual: "purchases_annual",
  af_purchase_monthly: "purchases_monthly",
  af_purchase_one_time_offer: "purchases_oto",
  af_first_plant_added: "first_plant",
};

/** Stored per platform (`installs_ios`...), and for these four also in total. */
const INSTALL_METRICS = ["installs", "installs_organic", "installs_paid", "cost"];
const EVENT_METRICS = [
  "purchases_annual",
  "purchases_monthly",
  "purchases_oto",
  // Purchases by users who came from a campaign.
  "purchases_paid",
  "first_plant",
];
const PLATFORMS = ["ios", "android"] as const;

export function appsFlyerConfigured(): boolean {
  return Boolean(
    config.appsflyer.apiToken && config.appsflyer.appIds.length > 0,
  );
}

/** A small CSV reader: quoted fields, doubled quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const number = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/[^\d.-]/g, ""));
  return v && v.trim() !== "" && Number.isFinite(n) ? n : 0;
};

const dayOf = (v: string | undefined) =>
  /^\d{4}-\d{2}-\d{2}/.exec((v ?? "").trim())?.[0];

function chunks(from: string, to: string): [string, string][] {
  const out: [string, string][] = [];
  let start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (start <= end) {
    const stop = new Date(
      Math.min(end.getTime(), start.getTime() + (CHUNK_DAYS - 1) * 86_400_000),
    );
    out.push([utcDay(start), utcDay(stop)]);
    start = new Date(stop.getTime() + 86_400_000);
  }
  return out;
}

/** An App Store id ("id6759450522") is iOS; a package name is Android. */
const platformOf = (app: string) => (/^id\d+$/i.test(app) ? "ios" : "android");

export interface AppsFlyerData {
  apps: string[];
  /** Whether AppsFlyer reported any cost in the fetched range. */
  hasCost: boolean;
  /** The days read this time. */
  window: { from: string; to: string };
  /** In-app events the report had no column for (never happened in the range). */
  missingEvents: string[];
}

export async function fetchAppsFlyer(
  since: string,
  signal?: AbortSignal,
): Promise<{ data: AppsFlyerData; daily: DailyPoint[] }> {
  const today = utcDay(new Date());
  // Aggregate history is kept 25 months: never ask (nor zero-fill) beyond 24.
  const now = new Date();
  const oldest = utcDay(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 24, now.getUTCDate())),
  );
  const from = since < oldest ? oldest : since;
  const totals = new Map<string, number>();
  const add = (day: string, metric: string, value: number) => {
    if (day < from || day > today || !value) return;
    const key = `${day}|${metric}`;
    totals.set(key, (totals.get(key) ?? 0) + value);
  };
  const apps = config.appsflyer.appIds;
  const missing = new Set<string>();

  for (const app of apps) {
    if (!/^(id\d+|[a-z][\w]*(\.[\w]+)+)$/i.test(app))
      throw new Error(
        `APPSFLYER_APP_IDS : identifiant invalide (${app.slice(0, 40)})`,
      );
    const p = platformOf(app);
    for (const [a, b] of chunks(from, today)) {
      const params = new URLSearchParams({
        from: a,
        to: b,
        currency: "preferred",
        timezone: "preferred",
      });
      const csv = await getText(
        "AppsFlyer",
        `${API}/${encodeURIComponent(app)}/partners_by_date_report/v5?${params}`,
        {
          Authorization: `Bearer ${config.appsflyer.apiToken}`,
          Accept: "text/csv",
        },
        { timeoutMs: 60_000, attempts: 2, signal },
      );
      await sleep(SPACING_MS);
      const [header, ...rows] = parseCsv(csv.replace(/^\uFEFF/, ""));
      // An empty answer is not "no installs": it must not zero the days already stored.
      if (!header) throw new Error("AppsFlyer : rapport vide");
      const names = header.map((h) => h.trim());
      const col = (re: RegExp) => names.findIndex((h) => re.test(h));
      const iDate = col(/^date$/i);
      const iSource = col(/^media source/i);
      const iInstalls = col(/^installs$/i);
      const iCost = col(/^total cost$/i);
      if (iDate < 0 || iSource < 0 || iInstalls < 0)
        throw new Error("AppsFlyer : format de rapport inattendu");
      // "af_purchase_annual (Unique users)": the users who did it, once each.
      const events = Object.entries(EVENTS).map(([event, metric]) => {
        const i = col(new RegExp(`^${event}\\s*\\(unique users\\)$`, "i"));
        if (i < 0) missing.add(event);
        return { i, metric };
      });
      for (const r of rows) {
        const day = dayOf(r[iDate]);
        if (!day) continue;
        const organic = /^organic$/i.test((r[iSource] ?? "").trim());
        const installs = number(r[iInstalls]);
        add(day, `installs_${p}`, installs);
        add(day, `installs_${organic ? "organic" : "paid"}_${p}`, installs);
        if (iCost >= 0) add(day, `cost_${p}`, number(r[iCost]));
        for (const { i, metric } of events) {
          if (i < 0) continue;
          const n = number(r[i]);
          add(day, `${metric}_${p}`, n);
          if (!organic && metric.startsWith("purchases_"))
            add(day, `purchases_paid_${p}`, n);
        }
      }
    }
  }

  // Every day of the range gets a value, zeros included, so a day without
  // installs does not keep an older figure.
  const metrics = [
    ...INSTALL_METRICS.flatMap((m) => [m, ...PLATFORMS.map((p) => `${m}_${p}`)]),
    ...EVENT_METRICS.flatMap((m) => PLATFORMS.map((p) => `${m}_${p}`)),
  ];
  const daily: DailyPoint[] = [];
  for (
    let d = new Date(`${from}T00:00:00Z`);
    utcDay(d) <= today;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    const day = utcDay(d);
    const value = (metric: string) => totals.get(`${day}|${metric}`) ?? 0;
    for (const metric of metrics) {
      daily.push({
        day,
        source: "appsflyer",
        metric,
        // A total is the two stores added up.
        value: INSTALL_METRICS.includes(metric)
          ? PLATFORMS.reduce((n, p) => n + value(`${metric}_${p}`), 0)
          : value(metric),
      });
    }
  }
  return {
    data: {
      apps,
      hasCost: daily.some((p) => p.metric === "cost" && p.value > 0),
      window: { from, to: today },
      missingEvents: [...missing],
    },
    daily,
  };
}

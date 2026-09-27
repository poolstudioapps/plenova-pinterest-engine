import "server-only";
import { config } from "@/lib/config";
import { getText, sleep, utcDay } from "@/lib/performance/http";
import type { DailyPoint } from "@/lib/performance/store";

/**
 * AppsFlyer, from its raw data (Pull API raw data, CSV, API token V2 in a
 * Bearer header): one row per install and per in-app event, counted here day
 * by day and per store (one app per store, so the app says the platform).
 *
 * The account's plan answered the aggregate reports with "Limit reached" from
 * the very first call (2026-09-27); the token set in Vercel is for raw data.
 *   - installs_report / organic_installs_report: installs from a campaign or
 *     organic, with the cost a network passes on the click;
 *   - in_app_events_report / organic_in_app_events_report, limited to the
 *     app's five events: purchases (annual, monthly, one-time offer), first
 *     plant added, first quick scan.
 * Raw data only goes back 90 days: the days before stay as stored. Days are
 * UTC days (the apps' own time zone is UTC too). The quota counts per report,
 * app and day from 00:00 UTC: lib/performance/refresh.ts spaces the reads.
 *
 * The spend AppsFlyer pulls from the networks linked to it (Meta's cost
 * integration, mapped by the owners) is not in the raw data: only its
 * aggregate report ("partners by date", Total Cost) carries it. That report is
 * tried as well, and when it answers its cost replaces the raw click costs;
 * when the plan still refuses it, it is tried again the next UTC day and the
 * cost it already stored is kept (see AppsFlyerOptions).
 */

const RAW_API = "https://hq1.appsflyer.com/api/raw-data/export/app";
const AGG_API = "https://hq1.appsflyer.com/api/agg-data/export/app";
/** Raw data is kept 90 days: ask a little less, so the first day asked is still there. */
export const RAW_DAYS = 88;
const SPACING_MS = 1500;

/** The app's in-app events, and the metric each one counts into. */
const EVENTS: Record<string, string> = {
  af_purchase_annual: "purchases_annual",
  af_purchase_monthly: "purchases_monthly",
  af_purchase_one_time_offer: "purchases_oto",
  af_first_plant_added: "first_plant",
  af_first_quick_scan: "first_scan",
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
  "first_scan",
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

/** One report of one app (raw by default): a column finder over its header, and its rows. */
async function report(
  app: string,
  name: string,
  from: string,
  to: string,
  signal: AbortSignal | undefined,
  extra: Record<string, string> = {},
  api = RAW_API,
): Promise<{ col: (name: RegExp) => number; rows: string[][] }> {
  const params = new URLSearchParams({
    from,
    to,
    currency: "preferred",
    ...(api === RAW_API ? { maximum_rows: "1000000" } : { timezone: "preferred" }),
    ...extra,
  });
  // Two tries of a minute at most: four of these per app must fit in the
  // refresh's time (lib/performance/refresh.ts), which aborts them past it.
  const csv = await getText(
    "AppsFlyer",
    `${api}/${encodeURIComponent(app)}/${name}/v5?${params}`,
    {
      Authorization: `Bearer ${config.appsflyer.apiToken}`,
      Accept: "text/csv",
    },
    { timeoutMs: 60_000, attempts: 2, signal },
  );
  await sleep(SPACING_MS);
  const [header, ...rows] = parseCsv(csv.replace(/^﻿/, ""));
  // An empty answer is not "no installs": it must not zero the days already stored.
  if (!header) throw new Error(`AppsFlyer : rapport ${name} vide`);
  const names = header.map((h) => h.trim());
  return { col: (re) => names.findIndex((h) => re.test(h)), rows };
}

export interface AppsFlyerOptions {
  /** False when the aggregate report was refused earlier the same UTC day. */
  tryAggregateCost: boolean;
  /**
   * The last day the aggregate report's cost was stored for, if it ever
   * answered: on a day it refuses, the days up to this one keep that cost
   * (the raw click costs would wipe Meta's), the later ones get click costs.
   */
  aggregateCostTo: string | null;
  /** Aborted when the refresh runs out of time: the calls still running stop. */
  signal?: AbortSignal;
}

export interface AppsFlyerData {
  apps: string[];
  /** Whether any cost was found in the fetched range. */
  hasCost: boolean;
  /** Where this reading's cost came from: the aggregate report, or the raw click costs. */
  costFrom: "aggregate" | "clicks";
  /** See AppsFlyerOptions.aggregateCostTo; carried from one reading to the next. */
  aggregateCostTo: string | null;
  /** The UTC day the aggregate report last refused, so it waits for the next one. */
  costRefusedOn: string | null;
  /** The days read this time (raw data goes back 90 days). */
  window: { from: string; to: string };
  /** False when the in-app events could not be read: their days were left as stored. */
  events: boolean;
  /** What went wrong without stopping the installs. */
  warnings: string[];
}

/** An App Store id ("id6759450522") is iOS; a package name is Android. */
const platformOf = (app: string) => (/^id\d+$/i.test(app) ? "ios" : "android");

export async function fetchAppsFlyer(
  since: string,
  options: AppsFlyerOptions,
): Promise<{ data: AppsFlyerData; daily: DailyPoint[] }> {
  const { signal } = options;
  const today = utcDay(new Date());
  const oldest = utcDay(new Date(Date.now() - RAW_DAYS * 86_400_000));
  const from = since < oldest ? oldest : since;
  const totals = new Map<string, number>();
  const add = (day: string, metric: string, value: number) => {
    if (day < from || day > today) return;
    const key = `${day}|${metric}`;
    totals.set(key, (totals.get(key) ?? 0) + value);
  };
  const warnings: string[] = [];
  let events = true;
  let foreignCost = false;
  const apps = config.appsflyer.appIds;
  for (const app of apps) {
    if (!/^(id\d+|[a-z][\w]*(\.[\w]+)+)$/i.test(app))
      throw new Error(
        `APPSFLYER_APP_IDS : identifiant invalide (${app.slice(0, 40)})`,
      );
  }

  // The two apps side by side (separate quotas); each app's reports in turn.
  await Promise.all(
    apps.map(async (app) => {
      const p = platformOf(app);
      for (const [name, organic] of [
        ["installs_report", false],
        ["organic_installs_report", true],
      ] as const) {
        const { col, rows } = await report(app, name, from, today, signal);
        const iTime = col(/^install time$/i);
        const iPrimary = col(/^is primary attribution$/i);
        const iCost = col(/^cost value$/i);
        const iCurrency = col(/^cost currency$/i);
        if (iTime < 0)
          throw new Error(`AppsFlyer : format de rapport inattendu (${name})`);
        for (const r of rows) {
          const day = dayOf(r[iTime]);
          if (!day) continue;
          // A secondary attribution is the same install seen twice.
          if (iPrimary >= 0 && /^false$/i.test((r[iPrimary] ?? "").trim()))
            continue;
          add(day, `installs_${p}`, 1);
          add(day, `installs_${organic ? "organic" : "paid"}_${p}`, 1);
          const cost = iCost >= 0 ? number(r[iCost]) : 0;
          if (cost > 0) {
            const currency = (r[iCurrency] ?? "").trim().toUpperCase();
            if (currency === "" || currency === "EUR")
              add(day, `cost_${p}`, cost);
            else foreignCost = true;
          }
        }
      }

      // The events matter less than the installs: a failure there leaves
      // their days as stored and says so, the installs still count.
      try {
        for (const [name, organic] of [
          ["in_app_events_report", false],
          ["organic_in_app_events_report", true],
        ] as const) {
          if (!events) return;
          const { col, rows } = await report(app, name, from, today, signal, {
            event_name: Object.keys(EVENTS).join(","),
          });
          const iTime = col(/^event time$/i);
          const iName = col(/^event name$/i);
          if (iTime < 0 || iName < 0)
            throw new Error(`format de rapport inattendu (${name})`);
          for (const r of rows) {
            const day = dayOf(r[iTime]);
            const metric = EVENTS[(r[iName] ?? "").trim()];
            if (!day || !metric) continue;
            add(day, `${metric}_${p}`, 1);
            if (!organic && metric.startsWith("purchases_"))
              add(day, `purchases_paid_${p}`, 1);
          }
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        if (events) {
          events = false;
          const message = err instanceof Error ? err.message : String(err);
          warnings.push(
            `Événements (achats, premières plantes) non relus : ${message.replace(/^AppsFlyer : /, "").slice(0, 200)}`,
          );
        }
      }
    }),
  );
  if (foreignCost)
    warnings.push("Des coûts dans une autre devise que l'euro ont été ignorés.");

  // The networks' spend (Meta...), from the aggregate report when the plan
  // lets it be read: it covers the click costs too, so it replaces them.
  let costFrom: AppsFlyerData["costFrom"] = "clicks";
  let costRefusedOn: string | null = null;
  if (options.tryAggregateCost) {
    try {
      const cost = new Map<string, number>();
      await Promise.all(
        apps.map(async (app) => {
          const p = platformOf(app);
          const { col, rows } = await report(
            app,
            "partners_by_date_report",
            from,
            today,
            signal,
            {},
            AGG_API,
          );
          const iDate = col(/^date$/i);
          const iCost = col(/^total cost$/i);
          if (iDate < 0 || iCost < 0)
            throw new Error("format de rapport inattendu (partners_by_date_report)");
          for (const r of rows) {
            const day = dayOf(r[iDate]);
            if (!day || day < from || day > today) continue;
            const key = `${day}|cost_${p}`;
            cost.set(key, (cost.get(key) ?? 0) + number(r[iCost]));
          }
        }),
      );
      for (const key of [...totals.keys()])
        if (key.includes("|cost_")) totals.delete(key);
      for (const [key, value] of cost) totals.set(key, value);
      costFrom = "aggregate";
    } catch (err) {
      if (signal?.aborted) throw err;
      costRefusedOn = today;
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(
        `Coûts des régies reliées à AppsFlyer (Meta…) non lus : ${message.replace(/^AppsFlyer : /, "").slice(0, 160)}. Nouvel essai demain${options.aggregateCostTo ? ", les coûts déjà relevés restent" : ""}.`,
      );
    }
  }
  // Read from the aggregate this time: its days are the ones it covers now.
  // Not read: the days it covered before keep their cost.
  const aggregateCostTo =
    costFrom === "aggregate" ? today : options.aggregateCostTo;
  const keepCostUntil = costFrom === "aggregate" ? null : options.aggregateCostTo;

  // Every day of the window gets a value, zeros included, so a day without
  // installs does not keep an older figure - except a cost this reading
  // could not know better than the stored one.
  const metrics = [
    ...INSTALL_METRICS.flatMap((m) => [m, ...PLATFORMS.map((p) => `${m}_${p}`)]),
    ...(events
      ? EVENT_METRICS.flatMap((m) => PLATFORMS.map((p) => `${m}_${p}`))
      : []),
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
      if (keepCostUntil && day <= keepCostUntil && metric.startsWith("cost"))
        continue;
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
      costFrom,
      aggregateCostTo,
      costRefusedOn,
      window: { from, to: today },
      events,
      warnings,
    },
    daily,
  };
}

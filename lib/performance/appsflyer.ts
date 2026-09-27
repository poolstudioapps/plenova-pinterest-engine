import "server-only";
import { config } from "@/lib/config";
import { getText, sleep, utcDay } from "@/lib/performance/http";
import type { DailyPoint } from "@/lib/performance/store";

/**
 * AppsFlyer: installs per day (organic and from campaigns, iOS and Android)
 * and the ad cost it knows about. Aggregate Pull API ("partners by date"
 * report, CSV), API token V2 in a Bearer header. Both apps report in UTC and
 * EUR.
 *
 * Meta's cost integration is set up in AppsFlyer (the owner, 2026-09-27): its
 * spend arrives in "Total Cost" whenever a campaign runs; other channels are
 * typed in on the page (lib/performance/spend.ts). The API
 * allows 24 calls a day per app (and 120 per account) for reports of 3 days
 * or more, counted from 00:00 UTC, with no limit on the range itself: one
 * call per app covers the whole range (a year at most per call, the history
 * being kept 25 months), and the refresh calls it every 3 hours at most.
 */

const API = "https://hq1.appsflyer.com/api/agg-data/export/app";
const CHUNK_DAYS = 365;
const SPACING_MS = 1500;

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

export interface AppsFlyerData {
  apps: string[];
  /** Whether AppsFlyer reported any cost in the fetched range. */
  hasCost: boolean;
}

export async function fetchAppsFlyer(
  since: string,
): Promise<{ data: AppsFlyerData; daily: DailyPoint[] }> {
  const today = utcDay(new Date());
  // AppsFlyer keeps 25 months of aggregate history: never ask (nor zero-fill)
  // beyond 24.
  const now = new Date();
  const oldest = utcDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 24, now.getUTCDate())));
  if (since < oldest) since = oldest;
  const totals = new Map<string, number>();
  const add = (day: string, metric: string, value: number) => {
    const key = `${day}|${metric}`;
    totals.set(key, (totals.get(key) ?? 0) + value);
  };

  for (const app of config.appsflyer.appIds) {
    if (!/^(id\d+|[a-z][\w]*(\.[\w]+)+)$/i.test(app))
      throw new Error(
        `APPSFLYER_APP_IDS : identifiant invalide (${app.slice(0, 40)})`,
      );
    const platform = app.startsWith("id") ? "ios" : "android";
    for (const [from, to] of chunks(since, today)) {
      const params = new URLSearchParams({
        from,
        to,
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
        { timeoutMs: 60_000 },
      );
      await sleep(SPACING_MS);
      const [header, ...rows] = parseCsv(csv.replace(/^\uFEFF/, ""));
      // An empty answer is not "no installs": it must not zero the days already stored.
      if (!header) throw new Error("AppsFlyer : rapport vide");
      const col = (name: RegExp) =>
        header.findIndex((h) => name.test(h.trim()));
      const iDate = col(/^date$/i);
      const iSource = col(/^media source/i);
      const iInstalls = col(/^installs$/i);
      const iCost = col(/^total cost$/i);
      if (iDate < 0 || iSource < 0 || iInstalls < 0)
        throw new Error("AppsFlyer : format de rapport inattendu");
      for (const r of rows) {
        const day = /^\d{4}-\d{2}-\d{2}/.exec(r[iDate] ?? "")?.[0];
        if (!day) continue;
        const installs = number(r[iInstalls]);
        const organic = /^organic$/i.test((r[iSource] ?? "").trim());
        add(day, "installs", installs);
        add(day, organic ? "installs_organic" : "installs_paid", installs);
        add(day, `installs_${platform}`, installs);
        if (iCost >= 0) add(day, "cost", number(r[iCost]));
      }
    }
  }

  // Every day of the range gets a value, zeros included, so a day without
  // installs does not keep an older figure.
  const daily: DailyPoint[] = [];
  const metrics = [
    "installs",
    "installs_organic",
    "installs_paid",
    "installs_ios",
    "installs_android",
    "cost",
  ];
  for (const [from, to] of chunks(since, today)) {
    for (
      let d = new Date(`${from}T00:00:00Z`);
      utcDay(d) <= to;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const day = utcDay(d);
      for (const metric of metrics)
        daily.push({
          day,
          source: "appsflyer",
          metric,
          value: totals.get(`${day}|${metric}`) ?? 0,
        });
    }
  }
  return {
    data: {
      apps: config.appsflyer.appIds,
      hasCost: daily.some((p) => p.metric === "cost" && p.value > 0),
    },
    daily,
  };
}

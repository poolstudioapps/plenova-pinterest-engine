import "server-only";
import { randomUUID } from "node:crypto";
import { config } from "@/lib/config";
import { redact } from "@/lib/errors";
import {
  amplitudeConfigured,
  fetchAmplitude,
} from "@/lib/performance/amplitude";
import {
  appsFlyerConfigured,
  fetchAppsFlyer,
} from "@/lib/performance/appsflyer";
import { daysAgo } from "@/lib/performance/http";
import {
  fetchRevenueCat,
  revenueCatConfigured,
} from "@/lib/performance/revenuecat";
import {
  latestSnapshots,
  pruneSnapshots,
  saveCohorts,
  saveDaily,
  saveSnapshot,
  type DailyPoint,
  type PerfSource,
} from "@/lib/performance/store";
import { supabaseService } from "@/lib/store/supabase";

/**
 * Reads RevenueCat, Amplitude and AppsFlyer and stores what they say in
 * Supabase (perf_daily, perf_cohorts, perf_snapshots). Called by the cron at
 * 09:00, 18:00 and 22:00 Paris time and by the page's refresh button.
 *
 * Every series is kept per day from the app's first days (PERF_EPOCH), so the
 * page can sum any period - 7, 30, 60 days, since the start or dates picked in
 * the calendar - without calling a vendor. The first run reads everything
 * since PERF_EPOCH; after that, the last 45 days, and once a week a longer
 * window (late refunds, cost corrections). The three sources run side by side
 * (separate vendors, separate limits); one failing does not stop the others.
 */

/** The app's first days: first AppsFlyer install 2026-02-26, first purchase 2026-02-26. */
export const PERF_EPOCH = "2026-02-01";
const RECENT_DAYS = 45;
const WEEKLY_EVERY_MS = 7 * 86_400_000;
/**
 * The weekly re-read: RevenueCat and Amplitude make the same number of calls
 * whatever the range, so they re-read everything; AppsFlyer pays one call per
 * 31 days and app, so it re-reads 90 days.
 */
const WEEKLY_DAYS: Record<
  "revenuecat" | "amplitude" | "appsflyer",
  number | "all"
> = {
  revenuecat: "all",
  amplitude: "all",
  appsflyer: 90,
};
/**
 * AppsFlyer allows 24 report calls a day per app, from 00:00 UTC: never more
 * often than this, success or not - and after "Limit reached", not before
 * the quota starts again at midnight UTC.
 */
const APPSFLYER_MIN_GAP_MS = 3 * 3_600_000;
const KEEP_SNAPSHOTS_DAYS = 14;
/**
 * Bumped when what a source stores changes meaning (a filter, a funnel's
 * definition): its next refresh re-reads everything since PERF_EPOCH, so no
 * old day keeps the former definition. 2: RevenueCat limited to the Plenova
 * apps, Amplitude's Home funnel limited to app 2.0.0 and later (2026-09-27).
 */
const DATA_VERSION: Record<"revenuecat" | "amplitude" | "appsflyer", number> = {
  revenuecat: 2,
  amplitude: 2,
  appsflyer: 1,
};
/** The routes may run 300 s: a source still busy after this is recorded as failed. */
const DEADLINE_MS = 240_000;
const LOCK_MS = 6 * 60_000;

export interface SourceOutcome {
  source: PerfSource;
  status: "ok" | "error" | "skipped" | "not-configured";
  window?: "first" | "weekly" | "recent";
  points?: number;
  error?: string;
}

interface Fetched {
  data: unknown;
  daily: DailyPoint[];
  cohorts?: { cohortStart: string }[];
}

export class RefreshBusyError extends Error {}

/** The app versions a previous snapshot counted, so a version never drops out of the conversion figures. */
function knownVersions(data: Record<string, unknown> | undefined): string[] {
  const v = data?.conversionVersions;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** AppsFlyer's answer once the day's report quota is used up. */
const quotaReached = (error: string | null | undefined) =>
  /limit reached/i.test(error ?? "");

/**
 * One refresh at a time: two would double the calls against each vendor's
 * limit. A single-row table (perf_lock) holds who is refreshing and until
 * when; a crashed run frees it by expiring.
 */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!config.supabase.url || !config.supabase.serviceKey)
    throw new Error("Supabase n'est pas configuré.");
  const db = supabaseService();
  const holder = randomUUID();
  const now = new Date();
  const { data, error } = await db
    .from("perf_lock")
    .update({
      holder,
      locked_until: new Date(now.getTime() + LOCK_MS).toISOString(),
    })
    .eq("id", 1)
    .or(`locked_until.is.null,locked_until.lt."${now.toISOString()}"`)
    .select("id");
  if (error) throw new Error(`verrou des relevés: ${error.message}`);
  if (!data?.length)
    throw new RefreshBusyError(
      "Un relevé est déjà en cours : réessaie dans quelques minutes.",
    );
  try {
    return await fn();
  } finally {
    await db
      .from("perf_lock")
      .update({ locked_until: null })
      .eq("id", 1)
      .eq("holder", holder);
  }
}

export async function refreshPerformance(): Promise<SourceOutcome[]> {
  return withLock(async () => {
    const latest = await latestSnapshots();
    const started = Date.now();

    async function run(
      source: "revenuecat" | "amplitude" | "appsflyer",
      configured: boolean,
      fetcher: (since: string) => Promise<Fetched>,
    ): Promise<SourceOutcome> {
      if (!configured) return { source, status: "not-configured" };
      const previous = latest[source].good;
      const lastAttempt = latest[source].last;
      if (
        source === "appsflyer" &&
        lastAttempt &&
        (started - Date.parse(lastAttempt.takenAt) < APPSFLYER_MIN_GAP_MS ||
          (quotaReached(lastAttempt.error) &&
            lastAttempt.takenAt.slice(0, 10) ===
              new Date(started).toISOString().slice(0, 10)))
      ) {
        return { source, status: "skipped" };
      }
      const weeklyAt =
        typeof previous?.data.weeklyAt === "string"
          ? previous.data.weeklyAt
          : null;
      const window: "first" | "weekly" | "recent" =
        !previous || previous.data.dataVersion !== DATA_VERSION[source]
          ? "first"
          : !weeklyAt || started - Date.parse(weeklyAt) > WEEKLY_EVERY_MS
            ? "weekly"
            : "recent";
      const weekly = WEEKLY_DAYS[source];
      const since =
        window === "first" || (window === "weekly" && weekly === "all")
          ? PERF_EPOCH
          : daysAgo(
              window === "weekly" && weekly !== "all" ? weekly : RECENT_DAYS,
            );

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          fetcher(since < PERF_EPOCH ? PERF_EPOCH : since),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    `${source} trop long (plus de ${DEADLINE_MS / 1000} s), relevé interrompu`,
                  ),
                ),
              DEADLINE_MS - (Date.now() - started),
            );
          }),
        ]);
        await saveDaily(result.daily);
        if (result.cohorts?.length) {
          await saveCohorts(
            result.cohorts.map((c) => ({
              cohortStart: c.cohortStart,
              granularity: "week" as const,
              source,
              data: c,
            })),
          );
        }
        await saveSnapshot(source, true, {
          ...(result.data as Record<string, unknown>),
          since,
          dataVersion: DATA_VERSION[source],
          weeklyAt: window === "recent" ? weeklyAt : new Date().toISOString(),
        });
        return { source, status: "ok", window, points: result.daily.length };
      } catch (err) {
        const message = redact(
          err instanceof Error ? err.message : String(err),
        ).slice(0, 300);
        console.error(`[performance] ${source}:`, message);
        const shown =
          source === "appsflyer" && quotaReached(message)
            ? `Quota AppsFlyer du jour atteint, nouvel essai après minuit UTC (${message})`
            : message;
        await saveSnapshot(source, false, {}, shown).catch(() => undefined);
        return { source, status: "error", error: shown };
      } finally {
        clearTimeout(timer);
      }
    }

    const outcomes = await Promise.all([
      run("revenuecat", revenueCatConfigured(), (since) =>
        fetchRevenueCat(since, PERF_EPOCH, knownVersions(latest.revenuecat.good?.data)),
      ),
      run("amplitude", amplitudeConfigured(), (since) => fetchAmplitude(since, PERF_EPOCH)),
      run("appsflyer", appsFlyerConfigured(), (since) => fetchAppsFlyer(since)),
    ]);
    await pruneSnapshots(KEEP_SNAPSHOTS_DAYS).catch((err) =>
      console.error(
        "[performance] purge:",
        err instanceof Error ? err.message : err,
      ),
    );
    return outcomes;
  });
}

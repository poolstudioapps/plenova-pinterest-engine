import "server-only";
import { config } from "@/lib/config";
import { supabaseService } from "@/lib/store/supabase";

/**
 * Where the Performances dashboard keeps what it fetched. The page reads these
 * tables only - never the vendors - so it opens instantly and the vendors are
 * called three times a day (lib/performance/refresh.ts), not on every visit.
 */

export type PerfSource = "revenuecat" | "amplitude" | "appsflyer" | "derived";

export interface Snapshot<T = Record<string, unknown>> {
  id: number;
  source: PerfSource;
  takenAt: string;
  ok: boolean;
  error: string | null;
  data: T;
}

export interface DailyPoint {
  day: string;
  source: string;
  metric: string;
  value: number;
}

function db() {
  if (!config.supabase.url || !config.supabase.serviceKey)
    throw new Error("Supabase n'est pas configuré.");
  return supabaseService();
}

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function saveSnapshot(
  source: PerfSource,
  ok: boolean,
  data: unknown,
  error: string | null = null,
): Promise<void> {
  const { error: dbError } = await db()
    .from("perf_snapshots")
    .insert({
      source,
      ok,
      error: error ? error.slice(0, 500) : null,
      data: data ?? {},
    });
  check("enregistrement d'un relevé", dbError);
}

/** The latest good snapshot of each source, and the latest attempt (to tell a failure). */
export async function latestSnapshots(): Promise<
  Record<PerfSource, { good: Snapshot | null; last: Snapshot | null }>
> {
  const sources: PerfSource[] = [
    "revenuecat",
    "amplitude",
    "appsflyer",
    "derived",
  ];
  const out = {} as Record<
    PerfSource,
    { good: Snapshot | null; last: Snapshot | null }
  >;
  await Promise.all(
    sources.map(async (source) => {
      const [
        { data: last, error: lastError },
        { data: good, error: goodError },
      ] = await Promise.all([
        db()
          .from("perf_snapshots")
          .select("*")
          .eq("source", source)
          .order("taken_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db()
          .from("perf_snapshots")
          .select("*")
          .eq("source", source)
          .eq("ok", true)
          .order("taken_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      check("lecture des relevés", lastError ?? goodError);
      const map = (row: Record<string, unknown> | null): Snapshot | null =>
        row
          ? {
              id: Number(row.id),
              source,
              takenAt: row.taken_at as string,
              ok: row.ok === true,
              error: (row.error as string | null) ?? null,
              data: (row.data as Record<string, unknown>) ?? {},
            }
          : null;
      out[source] = { good: map(good), last: map(last) };
    }),
  );
  return out;
}

export async function saveDaily(points: DailyPoint[]): Promise<void> {
  const rows = points
    .filter(
      (p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day) && Number.isFinite(p.value),
    )
    .map((p) => ({
      day: p.day,
      source: p.source,
      metric: p.metric,
      value: p.value,
      updated_at: new Date().toISOString(),
    }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db()
      .from("perf_daily")
      .upsert(rows.slice(i, i + 500));
    check("enregistrement des séries", error);
  }
}

/**
 * Every stored daily value from `since` (YYYY-MM-DD) on. Supabase answers
 * 1000 rows at most: the first page says how many there are, the others are
 * read side by side.
 */
export async function readAllDaily(since: string): Promise<DailyPoint[]> {
  const PAGE = 1000;
  const page = (from: number, withCount: boolean) =>
    db()
      .from("perf_daily")
      .select(
        "day, source, metric, value",
        withCount ? { count: "exact" } : undefined,
      )
      .gte("day", since)
      .order("day")
      .order("source")
      .order("metric")
      .range(from, from + PAGE - 1);
  const first = await page(0, true);
  check("lecture des séries", first.error);
  const total = first.count ?? first.data?.length ?? 0;
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) =>
      page((i + 1) * PAGE, false),
    ),
  );
  const out: DailyPoint[] = [];
  for (const res of [first, ...rest]) {
    check("lecture des séries", res.error);
    for (const r of res.data ?? []) {
      out.push({
        day: r.day as string,
        source: r.source as string,
        metric: r.metric as string,
        value: Number(r.value),
      });
    }
  }
  return out;
}

/**
 * Snapshots are a cache of what the vendors said, one row per source and
 * attempt: those older than `days` go, the newest good one of each source always stays.
 */
export async function pruneSnapshots(days: number): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const latest = await latestSnapshots();
  const keep = Object.values(latest)
    .map((l) => l.good?.id)
    .filter((id): id is number => typeof id === "number");
  let query = db().from("perf_snapshots").delete().lt("taken_at", cutoff);
  if (keep.length > 0) query = query.not("id", "in", `(${keep.join(",")})`);
  const { error } = await query;
  check("purge des relevés", error);
}

export async function saveCohorts(
  rows: {
    cohortStart: string;
    granularity: "day" | "week" | "month";
    source: string;
    data: unknown;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db()
    .from("perf_cohorts")
    .upsert(
      rows.map((r) => ({
        cohort_start: r.cohortStart,
        granularity: r.granularity,
        source: r.source,
        data: r.data,
        updated_at: new Date().toISOString(),
      })),
    );
  check("enregistrement des cohortes", error);
}

export async function readCohorts(
  granularity: "day" | "week" | "month",
  source: string,
  since: string,
): Promise<{ cohortStart: string; data: Record<string, unknown> }[]> {
  const { data, error } = await db()
    .from("perf_cohorts")
    .select("cohort_start, data")
    .eq("granularity", granularity)
    .eq("source", source)
    .gte("cohort_start", since)
    .order("cohort_start", { ascending: false });
  check("lecture des cohortes", error);
  return (data ?? []).map((r) => ({
    cohortStart: r.cohort_start as string,
    data: (r.data as Record<string, unknown>) ?? {},
  }));
}

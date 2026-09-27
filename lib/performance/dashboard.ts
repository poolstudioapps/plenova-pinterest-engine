import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { seesRevenue } from "@/lib/allowlist";
import { AUTH_COOKIE, readSession, sessionSecret } from "@/lib/auth";
import { amplitudeConfigured } from "@/lib/performance/amplitude";
import { appsFlyerConfigured } from "@/lib/performance/appsflyer";
import type { LtvInputs, SubscriberUsageMonth } from "@/lib/performance/ltv";
import type {
  PerfCohort,
  PerfPayload,
  PerfSourceStatus,
} from "@/lib/performance/compute";
import { utcDay } from "@/lib/performance/http";
import { PERF_EPOCH } from "@/lib/performance/refresh";
import { revenueCatConfigured } from "@/lib/performance/revenuecat";
import { listSpend } from "@/lib/performance/spend";
import {
  latestSnapshots,
  readAllDaily,
  readCohorts,
} from "@/lib/performance/store";

/**
 * Who may open the Performances page and its routes: the addresses marked
 * sees_revenue in the allowlist, nobody else, and never without a session.
 * Only `next dev` on a laptop skips the check (the middleware is open there
 * too). Asked once per request, however many places need it.
 */
export const performanceAccess = cache(
  async (): Promise<{ allowed: boolean; email: string | null }> => {
    const secret = await sessionSecret();
    const email = secret
      ? await readSession(secret, (await cookies()).get(AUTH_COOKIE)?.value)
      : null;
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL)
      return { allowed: true, email };
    return { allowed: email ? await seesRevenue(email) : false, email };
  },
);

/** "2.0.0" or "2.0.0 → 2.1.0": the app versions the conversion figures count. */
/** A stored LtvInputs, checked for shape (snapshots written before it existed have none). */
function isLtvInputs(v: unknown): v is LtvInputs {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.plans) &&
    Array.isArray(o.monthlyRetention) &&
    typeof o.realized === "object" &&
    o.realized !== null
  );
}

/** Stored subscriber usage, checked for shape. */
function usageOf(v: unknown): PerfPayload["subscriberUsage"] {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const rows = (x: unknown): SubscriberUsageMonth[] | null =>
    Array.isArray(x)
      ? x
          .filter(
            (r): r is Record<string, unknown> => !!r && typeof r === "object",
          )
          .map((r) => ({
            month: Number(r.month) || 0,
            active: Number(r.active) || 0,
            outOf: Number(r.outOf) || 0,
            complete: r.complete === true,
          }))
      : null;
  return { monthly: rows(o.monthly), annual: rows(o.annual) };
}

function versionsLabel(versions: unknown): string | null {
  if (!Array.isArray(versions)) return null;
  const list = versions.filter((v): v is string => typeof v === "string");
  const first = list[0];
  const last = list.at(-1);
  if (!first || !last) return null;
  return first === last ? first : `${first} → ${last}`;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Everything the page needs, read from Supabase only - never from a vendor. */
export async function performancePayload(): Promise<PerfPayload> {
  const [points, cohortRows, snapshots, spend] = await Promise.all([
    readAllDaily(PERF_EPOCH),
    readCohorts("week", "revenuecat", PERF_EPOCH),
    latestSnapshots(),
    listSpend(),
  ]);

  const series: PerfPayload["series"] = {};
  let firstDay: string | null = null;
  for (const p of points) {
    const key = `${p.source}:${p.metric}`;
    (series[key] ??= {})[p.day] = p.value;
    // "Since the start" begins at the first day with any activity, not at the epoch's zeros.
    if (p.value !== 0 && (firstDay === null || p.day < firstDay))
      firstDay = p.day;
  }
  const today = utcDay(new Date());

  const rc = snapshots.revenuecat.good?.data as
    Record<string, unknown> | undefined;
  const amp = snapshots.amplitude.good?.data as
    Record<string, unknown> | undefined;
  const af = snapshots.appsflyer.good?.data as
    Record<string, unknown> | undefined;
  const ltvInputs = isLtvInputs(rc?.ltvInputs) ? rc.ltvInputs : null;
  const churn = Array.isArray(rc?.churn)
    ? (rc.churn as Record<string, unknown>[])
    : [];

  const status = (
    source: PerfSourceStatus["source"],
    label: string,
    configured: boolean,
  ): PerfSourceStatus => {
    const s = snapshots[source];
    return {
      source,
      label,
      configured,
      lastOk: s.good?.takenAt ?? null,
      lastAttempt: s.last?.takenAt ?? null,
      error: s.last && !s.last.ok ? s.last.error : null,
    };
  };

  return {
    today,
    firstDay: firstDay ?? today,
    series,
    cohorts: cohortRows.map((c) => c.data as unknown as PerfCohort),
    spend: spend.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      channel: e.channel,
      amount: e.amount,
      note: e.note,
      createdBy: e.createdBy,
    })),
    sources: [
      status("revenuecat", "RevenueCat", revenueCatConfigured()),
      status("amplitude", "Amplitude", amplitudeConfigured()),
      status("appsflyer", "AppsFlyer", appsFlyerConfigured()),
    ],
    rc: rc
      ? {
          churnMonths: churn.map((m) => ({
            month: String(m.month),
            rate: num(m.rate),
            churned: num(m.churned),
            actives: num(m.actives),
            incomplete: m.incomplete === true,
          })),
          ltvInputs,
        }
      : null,
    conversionVersions: versionsLabel(amp?.versions),
    subscriberUsage: usageOf(amp?.subscriberUsage),
    appsflyerHasCost:
      Object.values(series["appsflyer:cost"] ?? {}).some((v) => v > 0) ||
      af?.hasCost === true,
  };
}

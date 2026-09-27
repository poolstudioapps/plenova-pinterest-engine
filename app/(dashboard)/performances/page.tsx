import { cookies } from "next/headers";
import { Notice, SectionHeader } from "@/components/ui";
import type { AfPeriod } from "@/components/performance/AcquisitionPanel";
import {
  PerformanceClient,
  type InitialRange,
} from "@/components/performance/PerformanceClient";
import {
  performanceAccess,
  performancePayload,
} from "@/lib/performance/dashboard";
import { isCalendarDay } from "@/lib/performance/compute";
import { parseView, VIEW_COOKIE } from "@/lib/performance/view";
import { revenueOverview } from "@/lib/revenue";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The app's performance: RevenueCat, Amplitude and AppsFlyer, read three
 * times a day into Supabase (lib/performance/refresh.ts). For the addresses
 * that see revenue only; everyone else gets a closed door, not the numbers.
 */
export default async function PerformancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await performanceAccess();
  if (!access.allowed) {
    return (
      <>
        <SectionHeader title="Performances" />
        <Notice tone="info">
          Cette page est réservée aux adresses qui voient les revenus de
          l&apos;app.
        </Notice>
      </>
    );
  }

  const [payload, live, params, jar] = await Promise.all([
    performancePayload(),
    revenueOverview(),
    searchParams,
    cookies(),
  ]);
  const one = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string) : undefined;
  // A date from the address bar is a real calendar day, kept within the data.
  const day = (d: string | undefined) =>
    d && DAY.test(d) && isCalendarDay(d)
      ? d < payload.firstDay
        ? payload.firstDay
        : d > payload.today
          ? payload.today
          : d
      : null;
  const from = day(one("from"));
  const to = day(one("to"));
  const p = one("p");
  const initial: InitialRange =
    from && to
      ? { custom: from <= to ? { from, to } : { from: to, to: from } }
      : { preset: p === "7" || p === "60" || p === "all" ? p : "30" };
  // The AppsFlyer section's own period, when one was picked there.
  const afFrom = day(one("af_from"));
  const afTo = day(one("af_to"));
  const af = one("af");
  const initialAf: AfPeriod =
    afFrom && afTo
      ? {
          kind: "custom",
          range: afFrom <= afTo ? { from: afFrom, to: afTo } : { from: afTo, to: afFrom },
        }
      : af === "7" || af === "30" || af === "90"
        ? { kind: "preset", days: Number(af) as 7 | 30 | 90 }
        : { kind: "page" };

  return (
    <>
      <SectionHeader
        title="Performances"
        description="Revenus, acquisition, utilisation et rentabilité de l'app Plenova, relevés à 9 h, 18 h et 22 h."
      />
      <PerformanceClient
        payload={payload}
        live={live.state === "ok" ? live.overview : null}
        initial={initial}
        initialView={parseView(jar.get(VIEW_COOKIE)?.value)}
        initialAf={initialAf}
      />
    </>
  );
}

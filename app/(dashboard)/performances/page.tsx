import { Notice, SectionHeader } from "@/components/ui";
import {
  PerformanceClient,
  type InitialRange,
} from "@/components/performance/PerformanceClient";
import {
  performanceAccess,
  performancePayload,
} from "@/lib/performance/dashboard";
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

  const [payload, live, params] = await Promise.all([
    performancePayload(),
    revenueOverview(),
    searchParams,
  ]);
  const one = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string) : undefined;
  // A date from the address bar is a real calendar day, kept within the data.
  const day = (d: string | undefined) =>
    d && DAY.test(d) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d)
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
      />
    </>
  );
}

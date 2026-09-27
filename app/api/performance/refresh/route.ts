import { handle, ok } from "@/lib/api";
import { conflict, rateLimited, unauthorized } from "@/lib/errors";
import { performanceAccess } from "@/lib/performance/dashboard";
import {
  RefreshBusyError,
  refreshPerformance,
} from "@/lib/performance/refresh";
import { latestSnapshots } from "@/lib/performance/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Between two refreshes asked by hand: the vendors' own limits come first. */
const COOLDOWN_MS = 15 * 60 * 1000;

/**
 * "Actualiser" on the Performances page: the same refresh as the 09:00, 18:00
 * and 22:00 runs, for the addresses that see revenue only.
 */
export async function POST() {
  return handle(async () => {
    if (!(await performanceAccess()).allowed)
      throw unauthorized("Réservé aux adresses qui voient les revenus.");
    const latest = await latestSnapshots();
    const last = Math.max(
      0,
      ...Object.values(latest).map((s) =>
        s.last ? Date.parse(s.last.takenAt) : 0,
      ),
    );
    const wait = last + COOLDOWN_MS - Date.now();
    if (wait > 0)
      throw rateLimited(
        `Données relevées il y a moins de 15 min : réessaie dans ${Math.ceil(wait / 60_000)} min.`,
      );
    try {
      return ok({ results: await refreshPerformance() });
    } catch (err) {
      if (err instanceof RefreshBusyError) throw conflict(err.message);
      throw err;
    }
  });
}

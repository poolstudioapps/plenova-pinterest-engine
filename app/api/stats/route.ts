import { handle, ok } from "@/lib/api";
import { readiness } from "@/lib/config";
import { ANGLES } from "@/lib/data/angles";
import { PLANTS } from "@/lib/data/plants";
import { getStore } from "@/lib/store";
import type { EngineStats } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Variations planned per plant+angle slot when projecting total capacity. */
const VARIATIONS_PER_SLOT = 4;

export async function GET() {
  return handle(async () => {
    const store = getStore();
    const pins = await store.listPins();

    const count = (s: string) => pins.filter((p) => p.status === s).length;

    const stats: EngineStats = {
      plants: PLANTS.length,
      angles: ANGLES.length,
      possibleCombinations:
        PLANTS.length * ANGLES.length * VARIATIONS_PER_SLOT,
      generated: pins.length,
      published: count("published"),
      queued: count("queued"),
      scheduled: count("scheduled"),
      failed: count("failed"),
      drafts: count("draft") + count("generated"),
    };

    return ok({
      stats,
      readiness: readiness(),
      store: { name: store.name, persistent: store.persistent },
    });
  });
}

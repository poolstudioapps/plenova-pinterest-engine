import { after } from "next/server";
import { handle, ok } from "@/lib/api";
import { analyzeSpyHooks, countUnreadSpyHooks } from "@/lib/spy-hooks";

export const dynamic = "force-dynamic";
// A few seconds per cover, and there can be a backlog of them.
export const maxDuration = 800;

let running = false;

/**
 * Reads the covers of the spied carousels not read yet, in the background.
 * The app does this after every spy pass; this is for the backlog, or a pass
 * whose reading was cut short. Answers with how many are waiting.
 */
export async function POST() {
  return handle(async () => {
    const unread = await countUnreadSpyHooks();
    if (unread > 0 && !running) {
      running = true;
      after(async () => {
        try {
          await analyzeSpyHooks({ limit: 150, log: (m) => console.warn(`[spy-hooks]${m}`) });
        } finally {
          running = false;
        }
      });
    }
    return ok({ unread }, 202);
  });
}

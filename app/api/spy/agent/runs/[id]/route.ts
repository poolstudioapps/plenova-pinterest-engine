import { after } from "next/server";
import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { authenticateAgent, finishAgentRun } from "@/lib/spy-agent";
import { analyzeSpyHooks } from "@/lib/spy-hooks";

export const dynamic = "force-dynamic";
// The covers of the new carousels are read once the pass is closed.
export const maxDuration = 800;

type Params = { params: Promise<{ id: string }> };

/** Closes a pass, then reads the hooks of whatever it brought, in the background. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const agent = await authenticateAgent(request);
    const { id } = await params;
    if (!/^\d{1,18}$/.test(id)) throw badRequest("Passage inconnu.");
    const body = (await request.json().catch(() => ({}))) as {
      found?: unknown;
      added?: unknown;
      errors?: unknown;
    };
    const errors = (Array.isArray(body.errors) ? body.errors : [])
      .map((e) => (e ?? {}) as Record<string, unknown>)
      .map((e) => ({
        username: String(e.username ?? "").slice(0, 40),
        message: String(e.message ?? "").slice(0, 300),
      }));
    await finishAgentRun(agent.id, id, {
      found: Math.max(0, Math.round(Number(body.found) || 0)),
      added: Math.max(0, Math.round(Number(body.added) || 0)),
      errors,
    });
    after(async () => {
      await analyzeSpyHooks({ log: (m) => console.warn(`[spy-hooks]${m}`) });
    });
    return ok({ ok: true });
  });
}

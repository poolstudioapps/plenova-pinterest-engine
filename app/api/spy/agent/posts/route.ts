import { handle, ok } from "@/lib/api";
import { authenticateAgent, recordAgentPost } from "@/lib/spy-agent";

export const dynamic = "force-dynamic";

/** A post found on an account: created if new, its numbers refreshed if known. */
export async function POST(request: Request) {
  return handle(async () => {
    await authenticateAgent(request);
    const body = (await request.json().catch(() => ({}))) as { post?: unknown };
    return ok(await recordAgentPost(body.post));
  });
}

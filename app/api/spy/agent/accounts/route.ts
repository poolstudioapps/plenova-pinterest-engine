import { handle, ok } from "@/lib/api";
import { authenticateAgent, recordAgentAccount } from "@/lib/spy-agent";

export const dynamic = "force-dynamic";

/** What a pass learned about one account: profile, followers, how the visit went. */
export async function POST(request: Request) {
  return handle(async () => {
    await authenticateAgent(request);
    const body = (await request.json().catch(() => ({}))) as { account?: unknown };
    await recordAgentAccount(body.account);
    return ok({ ok: true });
  });
}

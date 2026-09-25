import { handle, ok } from "@/lib/api";
import { authenticateAgent, startAgentRun } from "@/lib/spy-agent";

export const dynamic = "force-dynamic";

/** Opens a pass, so the app can say when the spy last ran. */
export async function POST(request: Request) {
  return handle(async () => {
    const agent = await authenticateAgent(request);
    const body = (await request.json().catch(() => ({}))) as { accounts?: unknown };
    const accounts = Number(body.accounts) > 0 ? Math.round(Number(body.accounts)) : 0;
    const host = request.headers.get("x-spy-host")?.slice(0, 80) ?? agent.name;
    return ok({ runId: await startAgentRun(agent.id, accounts, host) }, 201);
  });
}

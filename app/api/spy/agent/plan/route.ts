import { handle, ok } from "@/lib/api";
import { agentPlan, authenticateAgent } from "@/lib/spy-agent";

export const dynamic = "force-dynamic";

/** The accounts to visit this pass, and the posts already known for each. */
export async function GET(request: Request) {
  return handle(async () => {
    await authenticateAgent(request);
    return ok({ accounts: await agentPlan() });
  });
}

import { handle, ok } from "@/lib/api";
import { createSpyAgent, listSpyAgents } from "@/lib/spy-agent";

export const dynamic = "force-dynamic";

/** The computers allowed to run the spy. */
export async function GET() {
  return handle(async () => ok({ agents: await listSpyAgents() }));
}

/** Allows one more computer. The token is in this answer and nowhere else. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    return ok(await createSpyAgent(body.name), 201);
  });
}

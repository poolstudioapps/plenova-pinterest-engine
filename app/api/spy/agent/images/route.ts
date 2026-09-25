import { handle, ok } from "@/lib/api";
import { authenticateAgent, storeAgentImage } from "@/lib/spy-agent";

export const dynamic = "force-dynamic";

/** One picture copied from TikTok - a slide, a cover, an avatar. */
export async function POST(request: Request) {
  return handle(async () => {
    await authenticateAgent(request);
    const body = (await request.json().catch(() => ({}))) as { path?: unknown; data?: unknown };
    return ok({ url: await storeAgentImage(body.path, body.data) }, 201);
  });
}

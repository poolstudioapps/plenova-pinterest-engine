import { handle, ok } from "@/lib/api";
import { refreshPublishStatus } from "@/lib/carousel";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Asks TikTok again about every post still waiting on it.
 *
 * Publishing is asynchronous and can take minutes, so the check made during
 * the run cannot always reach a verdict. This is how the operator gets one
 * without republishing.
 */
export async function POST(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    return ok({ carousel: await refreshPublishStatus(id) });
  });
}

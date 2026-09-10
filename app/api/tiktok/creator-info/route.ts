import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { getCreatorInfo } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/**
 * Feeds the pre-publish dialog for one account.
 *
 * Queried live every time it opens: TikTok requires the privacy options shown
 * to come from this response rather than a cached or hard-coded list, and the
 * options differ per account.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const openId = new URL(request.url).searchParams.get("openId");
    if (!openId) throw badRequest("openId is required.");
    return ok({ creator: await getCreatorInfo(openId) });
  });
}

import { handle, ok } from "@/lib/api";
import { getCreatorInfo } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/**
 * Feeds the pre-publish dialog. Queried live every time it opens - TikTok
 * requires the privacy options shown to come from this response rather than a
 * cached or hard-coded list.
 */
export async function GET() {
  return handle(async () => {
    return ok({ creator: await getCreatorInfo() });
  });
}

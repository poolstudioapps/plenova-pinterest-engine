import { handle, ok } from "@/lib/api";
import { canHostPublicly } from "@/lib/images";
import { getStatus } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const status = await getStatus();
    return ok({
      ...status,
      // TikTok pulls slides by URL, so public hosting is as necessary as scope.
      canPublish: status.accounts.length > 0 && canHostPublicly(),
    });
  });
}

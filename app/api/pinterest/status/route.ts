import { handle, ok } from "@/lib/api";
import { canHostPublicly } from "@/lib/images";
import { getConnectionStatus } from "@/lib/pinterest";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const status = await getConnectionStatus();
    return ok({
      ...status,
      // Publishing needs all three: an account, write scope, and a public
      // image URL Pinterest can fetch.
      canPublish: status.connected && status.canWrite && canHostPublicly(),
    });
  });
}

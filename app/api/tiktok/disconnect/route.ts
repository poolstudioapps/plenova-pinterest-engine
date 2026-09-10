import { handle, ok } from "@/lib/api";
import { disconnect } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    await disconnect();
    return ok({ disconnected: true });
  });
}

import { handle, ok } from "@/lib/api";
import { disconnect } from "@/lib/pinterest";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    await disconnect();
    return ok({ disconnected: true });
  });
}

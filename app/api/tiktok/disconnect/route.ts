import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { disconnect } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      openId?: unknown;
    };
    const openId = typeof body.openId === "string" ? body.openId : "";
    if (!openId) throw badRequest("openId is required.");

    await disconnect(openId);
    return ok({ disconnected: openId });
  });
}

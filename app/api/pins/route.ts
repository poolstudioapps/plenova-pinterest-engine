import { handle, ok } from "@/lib/api";
import { getStore } from "@/lib/store";
import { parseOrThrow, pinFilterSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const filter = parseOrThrow(pinFilterSchema, params);
    const pins = await getStore().listPins(filter);
    return ok({ pins });
  });
}

import { handle, ok } from "@/lib/api";
import { getStore } from "@/lib/store";
import { mediaFilterSchema, parseOrThrow } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Lists the media library, filtered by plant, cultivar or aspect ratio. */
export async function GET(request: Request) {
  return handle(async () => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const filter = parseOrThrow(mediaFilterSchema, params);
    const media = await getStore().listMedia(filter);
    return ok({ media });
  });
}

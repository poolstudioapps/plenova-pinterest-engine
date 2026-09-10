import { handle, ok } from "@/lib/api";
import { saveComposedSlide } from "@/lib/carousel";
import { badRequest } from "@/lib/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** A composed slide, roughly 400 KB as base64. Well inside the body limit. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Receives one slide composed in the browser and stores it.
 *
 * One slide per request on purpose: a whole carousel of base64 JPEGs in a
 * single body would run past the platform's request size limit.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;

    let body: { index?: unknown; dataUrl?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Request body must be valid JSON.");
    }

    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index > 34) {
      throw badRequest("index must be a slide position.");
    }

    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw badRequest("dataUrl must be a base64 image data URL.");

    const data = Buffer.from(match[2]!, "base64");
    if (data.length === 0) throw badRequest("The composed slide is empty.");
    if (data.length > MAX_BYTES) throw badRequest("The composed slide is too large.");

    const carousel = await saveComposedSlide(id, index, data, match[1]!);
    return ok({ carousel });
  });
}

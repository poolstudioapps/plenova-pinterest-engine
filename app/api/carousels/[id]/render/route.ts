import { handle, ok } from "@/lib/api";
import { uploadComposedSlide } from "@/lib/carousel";
import { badRequest } from "@/lib/errors";
import { isContentLocale } from "@/lib/i18n";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** A composed slide, roughly 400 KB as base64. Well inside the body limit. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Receives one slide, in one language, composed in the browser.
 *
 * One slide per request on purpose: a whole carousel of base64 JPEGs in a
 * single body would run past the platform's request size limit - and with five
 * languages there are five times as many.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;

    let body: { index?: unknown; language?: unknown; dataUrl?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Request body must be valid JSON.");
    }

    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index > 34) {
      throw badRequest("index must be a slide position.");
    }
    if (!isContentLocale(body.language)) {
      throw badRequest("language must be one of the supported content locales.");
    }

    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw badRequest("dataUrl must be a base64 image data URL.");

    const data = Buffer.from(match[2]!, "base64");
    if (data.length === 0) throw badRequest("The composed slide is empty.");
    if (data.length > MAX_BYTES) throw badRequest("The composed slide is too large.");

    // Returns the stored URL and writes no record; the whole language is
    // recorded in one call once every slide is up.
    const { url } = await uploadComposedSlide(
      id,
      index,
      body.language,
      data,
      match[1]!,
    );
    return ok({ url });
  });
}

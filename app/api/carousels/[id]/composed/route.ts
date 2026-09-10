import { handle, ok } from "@/lib/api";
import { recordComposedSlides } from "@/lib/carousel";
import { badRequest } from "@/lib/errors";
import { isContentLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Records every composed slide of one language at once.
 *
 * The images are already stored; this only points the carousel at them. Doing
 * it in one call is the point: the state is a single JSON document, so a write
 * per slide meant rewriting the whole document once per slide, and a read that
 * lagged behind the previous write dropped slides without a word.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;

    let body: { language?: unknown; slides?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Request body must be valid JSON.");
    }

    if (!isContentLocale(body.language)) {
      throw badRequest("language must be one of the supported content locales.");
    }
    if (!Array.isArray(body.slides) || body.slides.length === 0) {
      throw badRequest("slides must be a non-empty array.");
    }

    const entries = body.slides.map((raw) => {
      const entry = (raw ?? {}) as { index?: unknown; url?: unknown };
      const index = Number(entry.index);
      if (!Number.isInteger(index) || index < 0 || index > 34) {
        throw badRequest("Each slide needs a valid index.");
      }
      // http in production, a data URL when running without a Blob store.
      const url = typeof entry.url === "string" ? entry.url : "";
      if (!url.startsWith("http") && !url.startsWith("data:")) {
        throw badRequest("Each slide needs the URL its image was stored at.");
      }
      return { index, url };
    });

    const carousel = await recordComposedSlides(id, body.language, entries);
    return ok({ carousel });
  });
}

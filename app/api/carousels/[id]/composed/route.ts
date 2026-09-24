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
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }

    if (!isContentLocale(body.language)) {
      throw badRequest("Cette langue de rédaction n'est pas prise en charge.");
    }
    if (!Array.isArray(body.slides) || body.slides.length === 0) {
      throw badRequest("Il faut au moins une slide à enregistrer.");
    }

    const entries = body.slides.map((raw) => {
      const entry = (raw ?? {}) as { index?: unknown; url?: unknown };
      const index = Number(entry.index);
      if (!Number.isInteger(index) || index < 0 || index > 34) {
        throw badRequest("Chaque slide a besoin d'une position valide.");
      }
      // http in production, a data URL when running without a Blob store.
      const url = typeof entry.url === "string" ? entry.url : "";
      if (!url.startsWith("http") && !url.startsWith("data:")) {
        throw badRequest("Chaque slide a besoin de l'URL où son image est stockée.");
      }
      return { index, url };
    });

    const carousel = await recordComposedSlides(id, body.language, entries);
    return ok({ carousel });
  });
}

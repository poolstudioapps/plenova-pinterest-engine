import { handle, ok } from "@/lib/api";
import { updateSlide } from "@/lib/carousel";
import { badRequest } from "@/lib/errors";
import { isContentLocale, type ContentLocale } from "@/lib/i18n";
import { normaliseOverlay } from "@/lib/overlay";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; index: string }> };

/**
 * Saves one slide's words and layout.
 *
 * Text is per language, layout is not: a slide is one design and only the
 * words in it change, which is also what stops seven translations drifting
 * into seven different-looking carousels.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id, index: rawIndex } = await params;

    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index > 34) {
      throw badRequest("index must be a slide position.");
    }

    let body: { text?: unknown; overlay?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Request body must be valid JSON.");
    }

    const text: Partial<
      Record<ContentLocale, { title: string; subtitle: string; cta?: string }>
    > = {};
    if (body.text !== undefined) {
      if (!body.text || typeof body.text !== "object") {
        throw badRequest("text must be an object keyed by language.");
      }
      for (const [language, value] of Object.entries(body.text)) {
        if (!isContentLocale(language)) {
          throw badRequest(`${language} is not a supported content locale.`);
        }
        const entry = (value ?? {}) as {
          title?: unknown;
          subtitle?: unknown;
          cta?: unknown;
        };
        text[language] = {
          title: String(entry.title ?? "").slice(0, 400),
          subtitle: String(entry.subtitle ?? "").slice(0, 600),
          cta: String(entry.cta ?? "").slice(0, 400),
        };
      }
    }

    const carousel = await updateSlide(id, index, {
      text: body.text !== undefined ? text : undefined,
      // Normalised rather than trusted: every field is clamped to something
      // renderable, so a hand-edited request cannot produce a broken slide.
      overlay:
        body.overlay !== undefined ? normaliseOverlay(body.overlay) : undefined,
    });

    return ok({ carousel });
  });
}

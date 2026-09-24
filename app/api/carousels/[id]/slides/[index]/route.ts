import { handle, ok } from "@/lib/api";
import { updateSlide } from "@/lib/carousel";
import { badRequest } from "@/lib/errors";
import { isContentLocale, type ContentLocale } from "@/lib/i18n";
import { normaliseOverlay } from "@/lib/overlay";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; index: string }> };

/**
 * Saves one slide's words, layout and photograph.
 *
 * Text is per language, layout is not: a slide is one design and only the
 * words in it change, which is also what stops seven translations drifting
 * into seven different-looking carousels. The photograph is named by its
 * library id and resolved here, so a request cannot point a slide at an
 * arbitrary URL.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id, index: rawIndex } = await params;

    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index > 34) {
      throw badRequest("La position de la slide est invalide.");
    }

    let body: {
      text?: unknown;
      overlay?: unknown;
      mediaId?: unknown;
      imagePrompt?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }

    const text: Partial<
      Record<ContentLocale, { title: string; subtitle: string; cta?: string }>
    > = {};
    if (body.text !== undefined) {
      if (!body.text || typeof body.text !== "object") {
        throw badRequest("Le texte doit être fourni par langue.");
      }
      for (const [language, value] of Object.entries(body.text)) {
        if (!isContentLocale(language)) {
          throw badRequest(`${language} n'est pas une langue de rédaction prise en charge.`);
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

    if (
      body.mediaId !== undefined &&
      (typeof body.mediaId !== "string" || !/^[\w-]{1,120}$/.test(body.mediaId))
    ) {
      throw badRequest("La photo choisie est invalide.");
    }
    if (body.imagePrompt !== undefined && typeof body.imagePrompt !== "string") {
      throw badRequest("La consigne de la photo doit être un texte.");
    }

    const carousel = await updateSlide(id, index, {
      text: body.text !== undefined ? text : undefined,
      // Normalised rather than trusted: every field is clamped to something
      // renderable, so a hand-edited request cannot produce a broken slide.
      overlay:
        body.overlay !== undefined ? normaliseOverlay(body.overlay) : undefined,
      mediaId: body.mediaId as string | undefined,
      imagePrompt:
        typeof body.imagePrompt === "string" ? body.imagePrompt.slice(0, 2000) : undefined,
    });

    return ok({ carousel });
  });
}

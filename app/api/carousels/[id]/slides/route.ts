import { handle, ok } from "@/lib/api";
import { saveSlides, type SlideInput } from "@/lib/carousel";
import { badRequest } from "@/lib/errors";
import { isContentLocale } from "@/lib/i18n";
import { normaliseOverlay } from "@/lib/overlay";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Saves every slide of a carousel from the editor, in one write: words,
 * layouts, pictures, and the slides themselves - added, removed, reordered.
 *
 * Everything is re-checked here rather than trusted: the overlay is
 * normalised, the words cleaned, and each picture named by its library id and
 * resolved on the server, so a request cannot point a slide at an arbitrary URL.
 */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;

    let body: { expectedLength?: unknown; slides?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    if (!Number.isInteger(body.expectedLength)) {
      throw badRequest("Indique combien de slides le carrousel avait à l'ouverture.");
    }
    if (!Array.isArray(body.slides)) throw badRequest("Envoie la liste des slides.");

    const inputs: SlideInput[] = body.slides.map((raw, i) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const from = s.from === null ? null : Number(s.from);
      if (from !== null && (!Number.isInteger(from) || from < 0)) {
        throw badRequest(`La slide ${i + 1} a une origine invalide.`);
      }
      if (s.mediaId !== null && (typeof s.mediaId !== "string" || !/^[\w-]{1,120}$/.test(s.mediaId))) {
        throw badRequest(`La photo de la slide ${i + 1} est invalide.`);
      }
      const text: SlideInput["text"] = {};
      if (s.text && typeof s.text === "object") {
        for (const [language, value] of Object.entries(s.text as Record<string, unknown>)) {
          if (isContentLocale(language)) text[language] = value as SlideInput["text"][typeof language];
        }
      }
      return {
        from,
        fromPhoto: typeof s.fromPhoto === "string" ? s.fromPhoto : null,
        text,
        overlay: normaliseOverlay(s.overlay),
        mediaId: (s.mediaId as string | null) ?? null,
        imagePrompt: typeof s.imagePrompt === "string" ? s.imagePrompt : "",
        kind: s.kind === "hook" || s.kind === "cta" ? s.kind : "content",
        mention: s.mention === true,
      };
    });

    const carousel = await saveSlides(id, body.expectedLength as number, inputs);
    return ok({ carousel });
  });
}

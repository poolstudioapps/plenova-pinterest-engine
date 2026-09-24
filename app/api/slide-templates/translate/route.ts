import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { translateSlideCopy } from "@/lib/gemini";
import { CONTENT_LOCALES, isContentLocale, type ContentLocale } from "@/lib/i18n";
import { cleanSlideText } from "@/lib/slide-text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Carries a saved slide's words from one language into others, with Gemini.
 * Returns the proposal only; nothing is saved until the operator keeps it.
 */
export async function POST(request: Request) {
  return handle(async () => {
    let body: { from?: unknown; text?: unknown; to?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    if (!isContentLocale(body.from)) throw badRequest("Choisis la langue de départ.");
    const to = (Array.isArray(body.to) ? body.to : CONTENT_LOCALES).filter(
      (l): l is ContentLocale => isContentLocale(l),
    );
    const source = cleanSlideText(body.text);
    if (!source.title.trim() && !source.subtitle.trim() && !(source.cta ?? "").trim()) {
      throw badRequest("Il n'y a rien à traduire dans cette langue.");
    }
    const text = await translateSlideCopy({
      from: body.from,
      text: { title: source.title, subtitle: source.subtitle, cta: source.cta ?? "" },
      to,
    });
    return ok({ text });
  });
}

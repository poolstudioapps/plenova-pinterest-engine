import { after } from "next/server";
import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { isContentLocale, type ContentLocale } from "@/lib/i18n";
import { OVERLAY_STYLES, type OverlayStyle } from "@/lib/overlay";
import { startSpyProcessing } from "@/lib/spy";

// Reading and remaking each slide is two model calls, and there can be many.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Rebuilds a spied carousel as ours, in the chosen languages. Answers as soon
 * as the carousel record exists; the work continues after the response, and
 * the carousel list follows it like any generation.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    let body: { languages?: unknown; imageMode?: unknown; overlayStyle?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    const languages: ContentLocale[] = Array.isArray(body.languages)
      ? body.languages.filter((l): l is ContentLocale => isContentLocale(l))
      : [];
    if (languages.length === 0) throw badRequest("Choisis au moins une langue.");

    const overlayStyle = OVERLAY_STYLES.includes(body.overlayStyle as OverlayStyle)
      ? (body.overlayStyle as OverlayStyle)
      : undefined;

    const { carousel, run } = await startSpyProcessing(id, {
      languages,
      imageMode: body.imageMode === "pexels" ? "pexels" : "clean",
      ...(overlayStyle ? { overlayStyle } : {}),
    });
    after(run);
    return ok({ carousel }, 202);
  });
}

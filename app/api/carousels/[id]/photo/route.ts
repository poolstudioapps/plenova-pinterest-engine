import { handle, ok } from "@/lib/api";
import { regenerateSlidePhoto } from "@/lib/carousel";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";
// A Pexels search then a Gemini render: usually well under a minute, never
// worth cutting off halfway through a paid call.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Makes a new photograph for one slide of a carousel and files it in the
 * library - for a slide already saved (by position) or one added in the
 * editor and not saved yet (by the picture it shows now).
 *
 * Returns the picture without touching the carousel; the editor applies it as
 * a draft, saved with everything else.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;

    let body: { slide?: unknown; prompt?: unknown; source?: unknown; mediaId?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    const slide = body.slide === null || body.slide === undefined ? null : Number(body.slide);
    if (slide !== null && (!Number.isInteger(slide) || slide < 0)) {
      throw badRequest("La position de la slide est invalide.");
    }

    const asset = await regenerateSlidePhoto(id, slide, {
      prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 2000) : undefined,
      source: body.source === "generate" ? "generate" : "photo",
      mediaId: typeof body.mediaId === "string" ? body.mediaId : undefined,
    });
    return ok({ asset }, 201);
  });
}

import { handle, ok } from "@/lib/api";
import { regenerateSlidePhoto } from "@/lib/carousel";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";
// A Pexels search then a Gemini render: usually well under a minute, never
// worth cutting off halfway through a paid call.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string; index: string }> };

/**
 * Makes a new photograph for one slide and files it in the library.
 *
 * Returns the picture without touching the slide; the editor applies it as a
 * draft, saved with everything else.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { id, index: rawIndex } = await params;
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index > 34) {
      throw badRequest("La position de la slide est invalide.");
    }

    let body: { prompt?: unknown; source?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }

    const asset = await regenerateSlidePhoto(id, index, {
      prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 2000) : undefined,
      source: body.source === "generate" ? "generate" : "photo",
    });
    return ok({ asset }, 201);
  });
}

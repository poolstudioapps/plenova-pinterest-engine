import { handle } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { imageResponse } from "@/lib/image-proxy";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * One library picture, from our own origin.
 *
 * The slide editor shows a photograph picked from the library before it is
 * saved onto the slide, and can export the slide with it - which means
 * drawing it into a canvas, which a cross-origin Blob URL would taint.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const asset = await getStore().getMedia(id);
    if (!asset) throw notFound(`Aucune image avec l'identifiant ${id}.`);
    return imageResponse(asset.url, "Cette image");
  });
}

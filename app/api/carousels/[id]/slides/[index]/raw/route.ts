import { handle } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { imageResponse } from "@/lib/image-proxy";
import { slideFingerprint } from "@/lib/slide-image";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; index: string }> };

/**
 * Streams one slide's photograph from the same origin.
 *
 * Addressed through the carousel rather than the media library on purpose. The
 * slide carries its own imageUrl, so this works even when the library entry is
 * missing - which is exactly what broke composing while the grid kept
 * displaying the picture perfectly.
 *
 * Same-origin because the overlay is captured inside an SVG foreignObject,
 * which cannot load cross-origin images: the canvas would be tainted and
 * toBlob would throw.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const { id, index } = await params;

    const position = Number(index);
    if (!Number.isInteger(position) || position < 0) {
      throw badRequest("La position de la slide est invalide.");
    }

    const carousel = await getStore().getCarousel(id);
    if (!carousel) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);

    /*
     * By identity first, position second. `photo` names the picture the page
     * asked for; a reorder saved a moment after the page moved its slides must
     * not hand back whatever now sits at that position. Position remains the
     * fallback for a request that names nothing.
     */
    const wanted = new URL(request.url).searchParams.get("photo");
    const slide =
      (wanted ? carousel.slides.find((s) => slideFingerprint(s) === wanted) : undefined) ??
      carousel.slides[position];
    if (!slide?.imageUrl) {
      throw notFound(`La slide ${position} n'a pas d'image.`);
    }

    return imageResponse(slide.imageUrl, `L'image de la slide ${position}`);
  });
}

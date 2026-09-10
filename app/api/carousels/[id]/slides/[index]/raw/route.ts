import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
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
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id, index } = await params;

    const position = Number(index);
    if (!Number.isInteger(position) || position < 0) {
      throw badRequest("index must be a slide position.");
    }

    const carousel = await getStore().getCarousel(id);
    if (!carousel) throw notFound(`No carousel with id ${id}.`);

    const slide = carousel.slides[position];
    if (!slide?.imageUrl) {
      throw notFound(`Slide ${position} has no image.`);
    }

    // Local development stores images inline; decode rather than re-fetch.
    if (slide.imageUrl.startsWith("data:")) {
      const [header, payload] = slide.imageUrl.split(",");
      const mime = header?.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
      return new NextResponse(Buffer.from(payload ?? "", "base64"), {
        headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300" },
      });
    }

    const upstream = await fetch(slide.imageUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      throw notFound(`Slide ${position} image could not be fetched.`);
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  });
}

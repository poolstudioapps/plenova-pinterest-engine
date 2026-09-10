import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Streams a media asset from the same origin.
 *
 * The overlay is captured inside an SVG foreignObject, which cannot load
 * cross-origin images - the canvas would be tainted and `toBlob` would throw.
 * Relaying through our own origin sidesteps that without depending on whatever
 * CORS headers the blob host happens to send.
 *
 * Addressed by asset id rather than by URL on purpose: a proxy that fetched an
 * arbitrary URL would be an SSRF hole.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const asset = await getStore().getMedia(id);
    if (!asset?.url) throw notFound(`No media asset with id ${id}.`);

    // Local development stores images inline; decode rather than re-fetch.
    if (asset.url.startsWith("data:")) {
      const [header, payload] = asset.url.split(",");
      const mime = header?.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
      return new NextResponse(Buffer.from(payload ?? "", "base64"), {
        headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300" },
      });
    }

    const upstream = await fetch(asset.url, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      throw notFound(`Media asset ${id} could not be fetched.`);
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? asset.mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  });
}

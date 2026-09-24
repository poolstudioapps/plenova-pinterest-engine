import "server-only";
import { NextResponse } from "next/server";
import { notFound } from "@/lib/errors";

/**
 * Streams a stored picture back from our own origin.
 *
 * Same-origin matters because slides are captured inside an SVG
 * foreignObject, which cannot load a cross-origin image: the canvas would be
 * tainted and exporting it would throw. Every picture the browser composes
 * with therefore comes through here.
 */
export async function imageResponse(url: string, what: string): Promise<NextResponse> {
  // Local development stores images inline; decode rather than re-fetch.
  if (url.startsWith("data:")) {
    const [header, payload] = url.split(",");
    const mime = header?.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
    return new NextResponse(Buffer.from(payload ?? "", "base64"), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300" },
    });
  }

  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    throw notFound(`${what} n'a pas pu être chargée.`);
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}

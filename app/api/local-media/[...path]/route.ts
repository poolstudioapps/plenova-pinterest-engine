import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { NextResponse } from "next/server";

/**
 * Serves the images a local checkout keeps on disk.
 *
 * Only reachable when no Blob store is attached - in production `hostImageAt`
 * uploads instead and nothing ever points here. It exists so a local run
 * behaves like the real thing: a record holds a URL, never the picture itself.
 */
export const dynamic = "force-dynamic";

const ROOT = join(process.cwd(), ".data", "media");

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const relative = path.join("/");

  /*
   * Contain the read inside .data/media.
   *
   * The segments come straight from the URL, so "../../.env" is a request the
   * client is free to make; normalising and then checking the prefix is what
   * turns that into a 404 rather than a file read.
   */
  const target = normalize(join(ROOT, relative));
  if (!target.startsWith(ROOT)) {
    return new NextResponse(null, { status: 404 });
  }

  const extension = relative.split(".").pop()?.toLowerCase() ?? "";
  const contentType = TYPES[extension];
  if (!contentType) return new NextResponse(null, { status: 404 });

  try {
    const data = await readFile(target);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

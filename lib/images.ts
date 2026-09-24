import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { put } from "@vercel/blob";
import { blobCredentials, config, isBlobConfigured } from "@/lib/config";
import { upstream } from "@/lib/errors";
import { scrubImageMetadata } from "@/lib/image-metadata";

/**
 * Image hosting (spec §16).
 *
 * Pinterest fetches the image by URL, so a Pin can only be published once the
 * bytes live somewhere public. With a Blob store attached we upload and return
 * a public URL.
 *
 * Without one - which is the normal state of a local checkout - the bytes go
 * to `.data/media/` and come back as a URL on this server. They used to come
 * back as a data: URL instead, and those got written into records: a local run
 * against the shared database put 28 MB of inlined pictures into it and took
 * the library page down. A file on disk behaves like the real thing, so local
 * and production differ in where images live rather than in what a record
 * holds.
 */

/** Where a local checkout keeps images, next to the file store's state.json. */
const LOCAL_MEDIA_DIR = join(process.cwd(), ".data", "media");

export interface HostedImage {
  url: string;
  /** True when the URL is a data: URL rather than a public https URL. */
  inline: boolean;
}

export function extensionFor(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

export function canHostPublicly(): boolean {
  return isBlobConfigured();
}

/**
 * Uploads an image at an explicit path. The media library organises images by
 * plant and cultivar, so callers own the path rather than deriving it here.
 */
export async function hostImageAt(
  pathname: string,
  input: Buffer,
  mimeType: string,
): Promise<HostedImage> {
  /*
   * Every image the app stores passes through here, which makes it the one
   * place worth scrubbing metadata: a photograph saved to the library, a slide
   * re-composed after an edit, a screenshot uploaded for a repost and every
   * republish of any of them all land on this line. Doing it at the call sites
   * instead would mean remembering it at eight of them.
   */
  const { data } = scrubImageMetadata(input);

  if (!canHostPublicly()) return hostOnDisk(pathname, data);

  try {
    const blob = await put(
      pathname,
      data,
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: mimeType,
        ...blobCredentials(),
      },
    );
    return { url: blob.url, inline: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw upstream("Impossible d'envoyer l'image du Pin vers le stockage Blob.", {
      reason: message.slice(0, 200),
    });
  }
}

/**
 * The local fallback: a real file, served back by /api/local-media.
 *
 * `inline` stays true because the URL still is not reachable from the public
 * internet, and that is what every publish path checks before handing a URL to
 * Pinterest or TikTok.
 */
async function hostOnDisk(
  pathname: string,
  data: Buffer,
): Promise<HostedImage> {
  // A path arrives as "media/monstera-deliciosa/med_abc.jpg"; keep the shape
  // so a local library is as browsable as the Blob dashboard.
  const safe = pathname.replace(/\.\./g, "").replace(/^\/+/, "");
  const target = join(LOCAL_MEDIA_DIR, safe);

  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw upstream("Impossible d'écrire l'image dans .data/media.", {
      reason: message.slice(0, 200),
    });
  }

  const base = config.app.url?.replace(/\/+$/, "") ?? "";
  return { url: `${base}/api/local-media/${safe}`, inline: true };
}

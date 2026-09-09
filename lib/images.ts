import "server-only";
import { put } from "@vercel/blob";
import { blobCredentials, isBlobConfigured } from "@/lib/config";
import { upstream } from "@/lib/errors";

/**
 * Image hosting (spec §16).
 *
 * Pinterest fetches the image by URL, so a Pin can only be published once the
 * bytes live somewhere public. With a Blob store attached we upload and return
 * a public URL; without one we fall back to an inline data URL, which is fine
 * for previewing locally but explicitly NOT publishable.
 */

export interface HostedImage {
  url: string;
  /** True when the URL is a data: URL rather than a public https URL. */
  inline: boolean;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

export function canHostPublicly(): boolean {
  return isBlobConfigured();
}

export async function hostPinImage(
  pinId: string,
  data: Buffer,
  mimeType: string,
): Promise<HostedImage> {
  if (!canHostPublicly()) {
    return {
      url: `data:${mimeType};base64,${data.toString("base64")}`,
      inline: true,
    };
  }

  try {
    const blob = await put(
      `pins/${pinId}.${extensionFor(mimeType)}`,
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
    throw upstream("Could not upload the Pin image to Blob storage.", {
      reason: message.slice(0, 200),
    });
  }
}

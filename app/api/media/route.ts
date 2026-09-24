import { handle, ok } from "@/lib/api";
import { randomToken } from "@/lib/crypto";
import { badRequest } from "@/lib/errors";
import { extensionFor, hostImageAt } from "@/lib/images";
import { getStore } from "@/lib/store";
import type { MediaAsset, MediaRole } from "@/lib/types";
import { mediaFilterSchema, parseOrThrow } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lists the media library, filtered by plant, cultivar or aspect ratio. */
export async function GET(request: Request) {
  return handle(async () => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const filter = parseOrThrow(mediaFilterSchema, params);
    const media = await getStore().listMedia(filter);
    return ok({ media });
  });
}

/** A prepared image, shrunk in the browser first, so a few MB at most. */
const MAX_BYTES = 8 * 1024 * 1024;

const ROLES: Record<MediaRole, { slug: string; name: string }> = {
  cta: { slug: "cta", name: "CTA Plenova" },
  hook: { slug: "hook", name: "Hook / Outro" },
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Files an image the operator prepared - a Plenova call-to-action, or an
 * opening/closing shot - into the library under its role.
 *
 * Goes through `hostImageAt` like every other image, so its metadata is
 * scrubbed before it is stored: a file exported from a design tool carries
 * that tool's name, the author, sometimes the source document's path.
 */
export async function POST(request: Request) {
  return handle(async () => {
    let body: {
      dataUrl?: unknown;
      role?: unknown;
      width?: unknown;
      height?: unknown;
      name?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête doit être du JSON valide.");
    }

    const role = body.role === "cta" || body.role === "hook" ? body.role : null;
    if (!role) throw badRequest("Indique si l'image est un CTA ou un hook.");

    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw badRequest("Envoie une image JPEG, PNG ou WebP.");

    const data = Buffer.from(match[2]!, "base64");
    if (data.length === 0) throw badRequest("Cette image est vide.");
    if (data.length > MAX_BYTES) throw badRequest("Cette image est trop lourde.");

    const mimeType = match[1]!;
    const width = Number(body.width);
    const height = Number(body.height);
    const aspectRatio =
      Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
        ? `${width / gcd(width, height)}:${height / gcd(width, height)}`
        : "4:5";

    const shelf = ROLES[role];
    const id = `med_up_${randomToken(10)}`;
    const hosted = await hostImageAt(
      `media/${shelf.slug}/${id}.${extensionFor(mimeType)}`,
      data,
      mimeType,
    );

    const now = new Date().toISOString();
    const label =
      typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const asset: MediaAsset = {
      id,
      plantSlug: shelf.slug,
      plantName: shelf.name,
      variety: null,
      varietySlug: null,
      url: hosted.url,
      mimeType,
      aspectRatio,
      prompt: label,
      visualStyle: "upload",
      angleSlug: null,
      source: "upload",
      sourceId: null,
      role,
      tags: [role, "upload"],
      usedCount: 0,
      lastUsedAt: null,
      createdAt: now,
    };

    await getStore().saveMedia(asset);
    return ok({ asset }, 201);
  });
}

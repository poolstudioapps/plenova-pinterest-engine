import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { extensionFor, hostImageAt } from "@/lib/images";
import { randomToken } from "@/lib/crypto";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** One screenshot, roughly 400 KB as base64 once the browser has shrunk it. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Stores one image the operator supplied and hands back where it went.
 *
 * One request per image on purpose: a dozen screenshots in a single body would
 * run past the platform's request size limit, and the point of uploading them
 * separately is that a slow one does not hold up the rest.
 */
export async function POST(request: Request) {
  return handle(async () => {
    let body: { dataUrl?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le contenu envoyé n'est pas du JSON valide.");
    }

    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw badRequest("Choisis une image JPEG, PNG ou WebP.");

    const data = Buffer.from(match[2]!, "base64");
    if (data.length === 0) throw badRequest("Cette image est vide.");
    if (data.length > MAX_BYTES) throw badRequest("Cette image est trop lourde (8 Mo maximum).");

    const mimeType = match[1]!;
    const hosted = await hostImageAt(
      `uploads/${randomToken(8)}.${extensionFor(mimeType)}`,
      data,
      mimeType,
    );
    return ok({ url: hosted.url });
  });
}

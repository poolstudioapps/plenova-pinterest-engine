import { after } from "next/server";
import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { isContentLocale, type ContentLocale } from "@/lib/i18n";
import { runRepost, startRepost } from "@/lib/repost-carousel";
import { OVERLAY_STYLES, type OverlayStyle } from "@/lib/overlay";

// Reading and cleaning one screenshot is two model calls, and there can be
// several, so the work needs room after the response.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

/**
 * Rebuilds somebody's carousel as ours, from screenshots the operator supplies.
 *
 * Answers as soon as the job is recorded and does the work in `after()`, the
 * same way ordinary generation does: this takes minutes, which is longer than
 * a browser tab can be relied on to stay open.
 */
export async function POST(request: Request) {
  return handle(async () => {
    let body: {
      frames?: unknown;
      languages?: unknown;
      theme?: unknown;
      overlayStyle?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Request body must be valid JSON.");
    }

    if (!Array.isArray(body.frames) || body.frames.length === 0) {
      throw badRequest("Add at least one screenshot.");
    }
    const frames = body.frames.map((frame) => {
      if (typeof frame !== "string" || !frame) {
        throw badRequest("Each screenshot must be a stored image.");
      }
      return frame;
    });

    const languages: ContentLocale[] = Array.isArray(body.languages)
      ? body.languages.filter((l): l is ContentLocale => isContentLocale(l))
      : [];
    if (languages.length === 0) {
      throw badRequest("Choose at least one language to write in.");
    }

    const overlayStyle = OVERLAY_STYLES.includes(body.overlayStyle as OverlayStyle)
      ? (body.overlayStyle as OverlayStyle)
      : undefined;

    const input = {
      frames,
      languages,
      theme: typeof body.theme === "string" ? body.theme : undefined,
      overlayStyle,
    };

    const carousel = await startRepost(input);
    after(async () => {
      await runRepost(carousel.id, input);
    });

    return ok({ carousel }, 202);
  });
}

import "server-only";
import { badRequest, notFound } from "@/lib/errors";
import { publishPin as publishToPinterest } from "@/lib/pinterest";
import { getStore } from "@/lib/store";
import type { PinRecord } from "@/lib/types";

/**
 * Publishing worker shared by the manual "Publish" button and the cron job, so
 * both paths apply identical guards, status transitions and retry accounting.
 *
 * A Pin only ever reaches `published` when Pinterest returns a Pin id
 * (spec §15).
 */

const MAX_ATTEMPTS = 3;

export interface PublishOutcome {
  pin: PinRecord;
  published: boolean;
  error?: string;
}

export async function publishRecord(
  pinIdValue: string,
  options: { boardId?: string; boardName?: string } = {},
): Promise<PublishOutcome> {
  const store = getStore();
  const pin = await store.getPin(pinIdValue);
  if (!pin) throw notFound(`No Pin with id ${pinIdValue}.`);

  if (pin.status === "published" && pin.pinterestPinId) {
    // Idempotent: never create a second Pin for the same record.
    return { pin, published: true };
  }

  const boardId = options.boardId ?? pin.boardId;
  if (!boardId) {
    throw badRequest("Select a Pinterest board before publishing.");
  }
  if (!pin.imageUrl) {
    throw badRequest("This Pin has no image. Regenerate it first.");
  }
  if (pin.imageIsInline) {
    throw badRequest(
      "This Pin's image is stored inline and Pinterest cannot fetch it. Attach a Blob store and regenerate.",
    );
  }

  const publishing: PinRecord = {
    ...pin,
    status: "publishing",
    boardId,
    boardName: options.boardName ?? pin.boardName,
    error: null,
    updatedAt: new Date().toISOString(),
  };
  await store.savePin(publishing);

  try {
    const { pinterestPinId } = await publishToPinterest({
      boardId,
      title: publishing.title,
      description: publishing.description,
      imageUrl: publishing.imageUrl!,
      link: publishing.link,
      altText: publishing.altText,
    });

    const published: PinRecord = {
      ...publishing,
      status: "published",
      pinterestPinId,
      publishedAt: new Date().toISOString(),
      error: null,
      attempts: publishing.attempts + 1,
      updatedAt: new Date().toISOString(),
    };
    await store.savePin(published);
    return { pin: published, published: true };
  } catch (err) {
    const attempts = publishing.attempts + 1;
    const message =
      err instanceof Error ? err.message : "Publishing failed for an unknown reason.";

    const failed: PinRecord = {
      ...publishing,
      // Below the retry ceiling the Pin goes back to the queue for the cron to
      // pick up; at the ceiling it stops so a broken Pin cannot loop forever.
      status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
      error: message,
      attempts,
      updatedAt: new Date().toISOString(),
    };
    await store.savePin(failed);
    return { pin: failed, published: false, error: message };
  }
}

/** Pins whose scheduled slot has arrived, oldest first. */
export async function dueForPublishing(now = Date.now()): Promise<PinRecord[]> {
  const pins = await getStore().listPins();
  return pins
    .filter((p) => {
      if (p.attempts >= MAX_ATTEMPTS) return false;
      if (!p.boardId) return false;
      if (p.status === "queued") return true;
      if (p.status === "scheduled" && p.scheduledAt) {
        return new Date(p.scheduledAt).getTime() <= now;
      }
      return false;
    })
    .sort((a, b) => {
      const at = a.scheduledAt ?? a.createdAt;
      const bt = b.scheduledAt ?? b.createdAt;
      return at.localeCompare(bt);
    });
}

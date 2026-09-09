import { handle, ok } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { PinRecord } from "@/lib/types";
import { parseJsonBody, queueSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Queues or schedules a Pin for the publishing worker. */
export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonBody(request, queueSchema);
    const store = getStore();

    const pin = await store.getPin(input.pinId);
    if (!pin) throw notFound(`No Pin with id ${input.pinId}.`);

    const boardId = input.boardId ?? pin.boardId;
    if (!boardId) {
      throw badRequest("A board must be selected before queueing a Pin.");
    }
    if (pin.imageIsInline) {
      throw badRequest(
        "This Pin's image is inline and cannot be published. Attach a Blob store and regenerate.",
      );
    }

    if (input.scheduledAt) {
      const when = new Date(input.scheduledAt).getTime();
      if (Number.isNaN(when)) throw badRequest("scheduledAt is not a valid date.");
      if (when <= Date.now()) {
        throw badRequest("scheduledAt must be in the future.");
      }
    }

    const updated: PinRecord = {
      ...pin,
      boardId,
      boardName: input.boardName ?? pin.boardName,
      status: input.scheduledAt ? "scheduled" : "queued",
      scheduledAt: input.scheduledAt ?? null,
      // A re-queue is a fresh start, so the retry budget resets.
      attempts: 0,
      error: null,
      updatedAt: new Date().toISOString(),
    };
    await store.savePin(updated);
    return ok({ pin: updated });
  });
}

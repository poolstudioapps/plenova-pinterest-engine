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
    if (!pin) throw notFound(`Aucun Pin avec l'identifiant ${input.pinId}.`);

    const boardId = input.boardId ?? pin.boardId;
    if (!boardId) {
      throw badRequest("Choisis un tableau avant de mettre le Pin en file.");
    }
    if (pin.imageIsInline) {
      throw badRequest(
        "L'image de ce Pin est stockée en inline et n'est pas publiable. Attache un store Blob, puis régénère.",
      );
    }

    if (input.scheduledAt) {
      const when = new Date(input.scheduledAt).getTime();
      if (Number.isNaN(when)) throw badRequest("La date de programmation n'est pas valide.");
      if (when <= Date.now()) {
        throw badRequest("La date de programmation doit être dans le futur.");
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

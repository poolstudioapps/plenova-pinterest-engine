import { handle, ok } from "@/lib/api";
import { updatePin } from "@/lib/engine";
import { notFound } from "@/lib/errors";
import { getStore } from "@/lib/store";
import { parseJsonBody, updatePinSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const pin = await getStore().getPin(id);
    if (!pin) throw notFound(`No Pin with id ${id}.`);
    return ok({ pin });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const patch = await parseJsonBody(request, updatePinSchema);
    const pin = await updatePin(id, patch);
    return ok({ pin });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const store = getStore();
    const pin = await store.getPin(id);
    if (!pin) throw notFound(`No Pin with id ${id}.`);
    await store.deletePin(id);
    return ok({ deleted: id });
  });
}

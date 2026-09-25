import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { deleteHook, updateHook } from "@/lib/hooks";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    let body: { text?: unknown; status?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    return ok({ hook: await updateHook(id, body) });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    await deleteHook(id);
    return ok({ ok: true });
  });
}

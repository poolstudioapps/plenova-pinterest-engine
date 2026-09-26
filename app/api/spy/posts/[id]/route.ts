import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { removeSpyPost, setSpyPostHandled } from "@/lib/spy";
import { viewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Sets a spied carousel aside ("dismissed"), or puts it back ("new"). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    let body: { status?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    return ok({ post: await setSpyPostHandled(id, body.status, (await viewer()).team) });
  });
}

/** Deletes the carousel for good; the spy will never bring it back. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    if (!/^\d{5,25}$/.test(id)) throw badRequest("Carrousel inconnu.");
    await removeSpyPost(id);
    return ok({ ok: true });
  });
}

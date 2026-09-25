import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { normaliseUsername, removeSpyAccount, updateSpyAccount } from "@/lib/spy";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const username = normaliseUsername(decodeURIComponent((await params).username));
    let body: { enabled?: unknown; note?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    return ok({ account: await updateSpyAccount(username, body) });
  });
}

/** Stops watching the account. The carousels already found stay. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const username = normaliseUsername(decodeURIComponent((await params).username));
    await removeSpyAccount(username);
    return ok({ ok: true });
  });
}

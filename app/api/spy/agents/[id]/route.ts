import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { revokeSpyAgent } from "@/lib/spy-agent";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Revokes a computer's token: its next pass is refused. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    if (!/^agt_[\w-]{4,40}$/.test(id)) throw badRequest("Poste inconnu.");
    await revokeSpyAgent(id);
    return ok({ ok: true });
  });
}

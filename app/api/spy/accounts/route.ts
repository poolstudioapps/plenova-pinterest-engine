import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { addSpyAccount } from "@/lib/spy";

export const dynamic = "force-dynamic";

/** Adds an account for the script to visit, from @name or a profile link. */
export async function POST(request: Request) {
  return handle(async () => {
    let body: { username?: unknown; team?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    return ok({ account: await addSpyAccount(body.username, body.team) }, 201);
  });
}

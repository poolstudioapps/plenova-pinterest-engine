import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { createHook, listHooks } from "@/lib/hooks";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok({ hooks: await listHooks() }));
}

/** Adds a hook to the bank. Answers with the existing one if it is already there. */
export async function POST(request: Request) {
  return handle(async () => {
    let body: { text?: unknown; source?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    const source = body.source === "gemini" ? "gemini" : "manual";
    const { hook, existed } = await createHook(body.text, source);
    return ok({ hook, existed }, existed ? 200 : 201);
  });
}

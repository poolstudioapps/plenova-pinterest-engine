import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { createHook, listHookViews } from "@/lib/hooks";
import { viewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** The bank, each spied hook with its post's numbers, and how many covers are still unread. */
export async function GET() {
  return handle(async () => ok(await listHookViews((await viewer()).team)));
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

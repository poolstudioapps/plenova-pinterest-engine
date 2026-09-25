import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { suggestHooks } from "@/lib/hooks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** New hooks from Gemini, none of them already in the bank. Nothing is saved. */
export async function POST(request: Request) {
  return handle(async () => {
    let body: { count?: unknown; plantSlug?: unknown; direction?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    return ok({ suggestions: await suggestHooks(body) });
  });
}

import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { createTemplate, listTemplates } from "@/lib/slide-templates";

export const dynamic = "force-dynamic";

/** Every saved slide, most recently edited first. */
export async function GET() {
  return handle(async () => ok({ templates: await listTemplates() }));
}

/** Keeps a slide - photo, layout, words per language - for any carousel. */
export async function POST(request: Request) {
  return handle(async () => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    const template = await createTemplate(body);
    return ok({ template }, 201);
  });
}

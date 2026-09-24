import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { deleteTemplate, updateTemplate } from "@/lib/slide-templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Renames a saved slide, or rewrites its words in any language. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw badRequest("Le corps de la requête n'est pas du JSON valide.");
    }
    const template = await updateTemplate(id, body);
    return ok({ template });
  });
}

/** Forgets a saved slide. Carousels it was inserted into keep their copy. */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    await deleteTemplate(id);
    return ok({ deleted: id });
  });
}

import { handle, ok } from "@/lib/api";
import { reorderSlides } from "@/lib/carousel";
import { badRequest, notFound } from "@/lib/errors";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const carousel = await getStore().getCarousel(id);
    if (!carousel) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);
    return ok({ carousel });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const store = getStore();
    if (!(await store.getCarousel(id))) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);
    await store.deleteCarousel(id);
    return ok({ deleted: id });
  });
}

/** Reorders the slides: `{ order: number[] }`, current positions in their new sequence. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    let body: { order?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw badRequest("Le corps de la requête doit être du JSON valide.");
    }
    if (!Array.isArray(body.order) || !body.order.every((i) => typeof i === "number")) {
      throw badRequest("Envoie le nouvel ordre des slides.");
    }
    const carousel = await reorderSlides(id, body.order as number[]);
    return ok({ carousel });
  });
}

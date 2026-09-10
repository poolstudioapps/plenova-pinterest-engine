import { handle, ok } from "@/lib/api";
import { updateCarousel } from "@/lib/carousel";
import { notFound } from "@/lib/errors";
import { getStore } from "@/lib/store";
import { parseJsonBody, updateCarouselSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const carousel = await getStore().getCarousel(id);
    if (!carousel) throw notFound(`No carousel with id ${id}.`);
    return ok({ carousel });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const patch = await parseJsonBody(request, updateCarouselSchema);
    return ok({ carousel: await updateCarousel(id, patch) });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const store = getStore();
    if (!(await store.getCarousel(id))) throw notFound(`No carousel with id ${id}.`);
    await store.deleteCarousel(id);
    return ok({ deleted: id });
  });
}

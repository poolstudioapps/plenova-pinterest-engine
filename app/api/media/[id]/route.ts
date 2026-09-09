import { handle, ok } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const asset = await getStore().getMedia(id);
    if (!asset) throw notFound(`No media asset with id ${id}.`);
    return ok({ asset });
  });
}

/**
 * Removes the asset from the index. The blob itself is left in place on
 * purpose: Pins already published to Pinterest point at that URL, and breaking
 * a live Pin's image to tidy a library is not a trade worth making.
 */
export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const store = getStore();
    const asset = await store.getMedia(id);
    if (!asset) throw notFound(`No media asset with id ${id}.`);
    await store.deleteMedia(id);
    return ok({ deleted: id });
  });
}

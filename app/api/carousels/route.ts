import { handle, ok } from "@/lib/api";
import { createCarousel } from "@/lib/carousel";
import { getStore } from "@/lib/store";
import { createCarouselSchema, parseJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    return ok({ carousels: await getStore().listCarousels() });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonBody(request, createCarouselSchema);
    return ok({ carousel: await createCarousel(input) });
  });
}

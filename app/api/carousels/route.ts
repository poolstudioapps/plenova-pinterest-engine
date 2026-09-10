import { handle, ok } from "@/lib/api";
import { generateCarousel } from "@/lib/carousel";
import { getStore } from "@/lib/store";
import { generateCarouselSchema, parseJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    return ok({ carousels: await getStore().listCarousels() });
  });
}

// A carousel is designed then illustrated: one text call plus one image call
// per slide, so it needs far more room than a single Pin.
export const maxDuration = 600;

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonBody(request, generateCarouselSchema);
    return ok({ carousel: await generateCarousel(input) });
  });
}

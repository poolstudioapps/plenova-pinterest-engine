import { after } from "next/server";
import { handle, ok } from "@/lib/api";
import { runCarouselGeneration, startCarousel } from "@/lib/carousel";
import { getStore } from "@/lib/store";
import { generateCarouselSchema, parseJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

// The work continues after the response, so the function needs room for it.
export const maxDuration = 800;

export async function GET() {
  return handle(async () => {
    return ok({ carousels: await getStore().listCarousels() });
  });
}

/**
 * Starts a carousel and answers immediately.
 *
 * Writing and illustrating a carousel takes minutes - longer than a browser
 * tab can be relied on to stay open. The record is persisted first, the
 * response returns straight away, and the work continues in `after()`, which
 * keeps the function alive past the response. Navigating away, or closing the
 * tab, no longer cancels anything.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonBody(request, generateCarouselSchema);
    const carousel = await startCarousel(input);

    after(async () => {
      await runCarouselGeneration(carousel.id, input);
    });

    return ok({ carousel }, 202);
  });
}

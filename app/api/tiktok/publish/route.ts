import { handle, ok } from "@/lib/api";
import { publishCarouselRecord } from "@/lib/carousel";
import { parseJsonBody, publishCarouselSchema } from "@/lib/validation";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonBody(request, publishCarouselSchema);
    const outcome = await publishCarouselRecord(input.carouselId, {
      postMode: input.postMode,
      privacyLevel: input.privacyLevel,
      brandContentToggle: input.brandContentToggle,
      brandOrganicToggle: input.brandOrganicToggle,
    });
    // 502 on failure so the UI can never render a false success.
    return ok(outcome, outcome.published ? 200 : 502);
  });
}

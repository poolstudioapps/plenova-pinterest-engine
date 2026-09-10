import { handle, ok } from "@/lib/api";
import { publishToAccounts } from "@/lib/carousel";
import { parseJsonBody, publishCarouselSchema } from "@/lib/validation";

// One API round trip per account, so several accounts need real headroom.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Posts one carousel to several accounts at once, each in its own language.
 *
 * Returns 502 when nothing published, so the UI can never show a false
 * success; a partial run reports 200 with the per-account outcome, because
 * five successes and one expired token is not a failed run.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonBody(request, publishCarouselSchema);
    const outcome = await publishToAccounts(input.carouselId, input.openIds, {
      postMode: input.postMode,
      privacyLevel: input.privacyLevel,
      brandContentToggle: input.brandContentToggle,
      brandOrganicToggle: input.brandOrganicToggle,
    });
    return ok(outcome, outcome.publishedCount > 0 ? 200 : 502);
  });
}

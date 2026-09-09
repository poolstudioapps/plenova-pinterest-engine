import { handle, ok } from "@/lib/api";
import { publishRecord } from "@/lib/publisher";
import { parseJsonBody, publishSchema } from "@/lib/validation";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonBody(request, publishSchema);
    const outcome = await publishRecord(input.pinId, {
      boardId: input.boardId,
      boardName: input.boardName,
    });
    // 502 on failure so the client never renders a false success (spec §15).
    return ok(outcome, outcome.published ? 200 : 502);
  });
}

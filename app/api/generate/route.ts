import { handle, ok } from "@/lib/api";
import { generatePin } from "@/lib/engine";
import { generateSchema, parseJsonBody } from "@/lib/validation";

// Image generation is slow; give it room before the platform timeout.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonBody(request, generateSchema);
    const pin = await generatePin(input);
    return ok({ pin });
  });
}

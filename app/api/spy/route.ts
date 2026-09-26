import { handle, ok } from "@/lib/api";
import { spyOverview } from "@/lib/spy";
import { viewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

/** Everything the spy page shows: accounts, carousels found, the last pass. */
export async function GET() {
  return handle(async () => ok(await spyOverview((await viewer()).team)));
}

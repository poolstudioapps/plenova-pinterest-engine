import { handle, ok } from "@/lib/api";
import { listBoards } from "@/lib/pinterest";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const boards = await listBoards();
    return ok({ boards });
  });
}

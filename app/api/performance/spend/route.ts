import { handle, ok } from "@/lib/api";
import { badRequest, unauthorized } from "@/lib/errors";
import { performanceAccess } from "@/lib/performance/dashboard";
import { addSpend, deleteSpend } from "@/lib/performance/spend";

export const dynamic = "force-dynamic";

async function allowed(): Promise<string | null> {
  const access = await performanceAccess();
  if (!access.allowed)
    throw unauthorized("Réservé aux adresses qui voient les revenus.");
  return access.email;
}

/** Adds an ad spend typed in on the Performances page. */
export async function POST(request: Request) {
  return handle(async () => {
    const email = await allowed();
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) throw badRequest("Requête invalide.");
    return ok({ entry: await addSpend(body, email) }, 201);
  });
}

/** Removes one (`?id=`). */
export async function DELETE(request: Request) {
  return handle(async () => {
    await allowed();
    await deleteSpend(new URL(request.url).searchParams.get("id") ?? "");
    return ok({ deleted: true });
  });
}

import { handle, ok } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { isContentLocale } from "@/lib/i18n";
import { getStatus, setAccountLanguage } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await getStatus()));
}

/** Assigns the language an account publishes in. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      openId?: unknown;
      language?: unknown;
    };
    const openId = typeof body.openId === "string" ? body.openId : "";
    if (!openId) throw badRequest("openId is required.");
    if (!isContentLocale(body.language)) {
      throw badRequest("language must be one of the supported content locales.");
    }

    const account = await setAccountLanguage(openId, body.language);
    return ok({ openId: account.openId, language: account.language });
  });
}

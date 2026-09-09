import { handle, ok } from "@/lib/api";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import { dueForPublishing, publishRecord } from "@/lib/publisher";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Publishing worker (spec §20). Vercel Cron calls this on a schedule; the
 * CRON_SECRET check keeps it from being triggered by anyone with the URL.
 *
 * Pinterest allows roughly 1,000 write operations per day, so each run
 * publishes a small batch rather than draining the whole queue at once.
 */
const BATCH_SIZE = 5;

export async function GET(request: Request) {
  const secret = config.security.cronSecret;
  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    if (!safeEqual(header, `Bearer ${secret}`)) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Unauthorized." } },
        { status: 401 },
      );
    }
  } else if (process.env.VERCEL) {
    // Refuse to run unauthenticated in production.
    return NextResponse.json(
      {
        error: {
          code: "not_configured",
          message: "CRON_SECRET must be set before the publishing worker can run.",
        },
      },
      { status: 503 },
    );
  }

  return handle(async () => {
    const due = (await dueForPublishing()).slice(0, BATCH_SIZE);
    const results = [];

    for (const pin of due) {
      const outcome = await publishRecord(pin.id);
      results.push({
        id: pin.id,
        title: pin.title,
        published: outcome.published,
        error: outcome.error ?? null,
      });
    }

    return ok({
      processed: results.length,
      published: results.filter((r) => r.published).length,
      results,
    });
  });
}

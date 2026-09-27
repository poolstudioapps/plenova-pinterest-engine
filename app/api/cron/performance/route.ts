import { NextResponse } from "next/server";
import { handle, ok } from "@/lib/api";
import { config } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import {
  RefreshBusyError,
  refreshPerformance,
} from "@/lib/performance/refresh";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * The Performances dashboard's refresh: RevenueCat, Amplitude and AppsFlyer
 * are read and stored in Supabase at 09:00, 18:00 and 22:00, Paris time
 * (asked for by the user). Vercel Cron calls this every hour - its schedule is
 * in UTC and Paris changes time twice a year - and only those three hours do
 * the work. `?force=1` runs it at once (still behind CRON_SECRET).
 */
const HOURS = new Set([9, 18, 22]);

/** The hour in Paris, 0-23. Read from the parts: fr-FR formats it "09 h". */
function parisHour(): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .find((p) => p.type === "hour")?.value;
  return Number(hour);
}

export async function GET(request: Request) {
  const secret = config.security.cronSecret;
  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    if (!safeEqual(header, `Bearer ${secret}`)) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Accès refusé." } },
        { status: 401 },
      );
    }
  } else if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error: {
          code: "not_configured",
          message:
            "Renseigne CRON_SECRET pour que les relevés programmés puissent tourner.",
        },
      },
      { status: 503 },
    );
  }

  return handle(async () => {
    const force = new URL(request.url).searchParams.get("force") === "1";
    const hour = parisHour();
    if (!force && !HOURS.has(hour))
      return ok({ skipped: true, parisHour: hour });
    try {
      return ok({
        skipped: false,
        parisHour: hour,
        results: await refreshPerformance(),
      });
    } catch (err) {
      // A refresh asked by hand is already running: this one has nothing to add.
      if (err instanceof RefreshBusyError)
        return ok({ skipped: true, busy: true, parisHour: hour });
      throw err;
    }
  });
}

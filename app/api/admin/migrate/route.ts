import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { config, isBlobConfigured } from "@/lib/config";
import { BlobStore } from "@/lib/store/blob";
import { SupabaseStore } from "@/lib/store/supabase";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Moves everything out of the blob document and into rows, once.
 *
 * Reads through the old adapter's own interface rather than poking at the
 * document, so whatever it can serve is what gets copied. Writing is by
 * upsert, so running it twice changes nothing the second time - which matters,
 * because a migration you are afraid to re-run is a migration you cannot
 * verify.
 *
 * Behind the password, and it only ever writes to the new store.
 */
export async function POST(request: Request) {
  /**
   * A session, or a one-off token set for the move and removed after it.
   *
   * The token exists because the migration has to be run by whoever is doing
   * the move, and that is not always someone who can sign in to the dashboard.
   * It is compared in constant time and it is not meant to outlive the
   * migration.
   */
  const migrationToken = process.env.MIGRATION_TOKEN;
  const offered = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const byToken = Boolean(
    migrationToken && offered && safeEqual(migrationToken, offered),
  );

  const secret = process.env.ADMIN_PASSWORD;
  if (!byToken && secret) {
    const session = (await cookies()).get(AUTH_COOKIE)?.value;
    if (!(await verifySession(secret, session))) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
  }

  if (!config.supabase.url || !config.supabase.serviceKey) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 400 },
    );
  }
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "There is no blob store to read from." },
      { status: 400 },
    );
  }

  const from = new BlobStore();
  const to = new SupabaseStore();
  const moved: Record<string, number> = {};
  const failed: { what: string; reason: string }[] = [];

  const step = async (what: string, run: () => Promise<number>) => {
    try {
      moved[what] = await run();
    } catch (err) {
      failed.push({
        what,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  };

  await step("pins", async () => {
    const pins = await from.listPins();
    for (const pin of pins) await to.savePin(pin);
    return pins.length;
  });

  await step("media", async () => {
    const assets = await from.listMedia();
    // One statement, since there can be a lot of these.
    await to.saveManyMedia(assets);
    return assets.length;
  });

  await step("carousels", async () => {
    const carousels = await from.listCarousels();
    for (const carousel of carousels) await to.saveCarousel(carousel);
    return carousels.length;
  });

  await step("tiktok", async () => {
    const accounts = await from.listTikTokAccounts();
    for (const account of accounts) await to.saveTikTokAccount(account);
    return accounts.length;
  });

  await step("pinterest", async () => {
    const connection = await from.getConnection();
    if (!connection) return 0;
    await to.setConnection(connection);
    return 1;
  });

  return NextResponse.json(
    { ok: failed.length === 0, moved, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}

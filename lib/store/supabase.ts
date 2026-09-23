import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";
import { decryptJson, encryptJson, hasEncryptionKey } from "@/lib/crypto";
import { filterMedia, type MediaFilter } from "@/lib/media";
import type { ContentLocale } from "@/lib/i18n";
import type {
  CarouselRecord,
  MediaAsset,
  PinRecord,
  PinterestConnection,
  TikTokAccount,
} from "@/lib/types";
import {
  applyFilter,
  normaliseAccounts,
  normaliseCarousel,
  type EngineStore,
  type PinFilter,
} from "./types";

/**
 * Rows, at last.
 *
 * Everything used to live in one JSON document on blob storage, which made
 * every save a read-modify-write of the entire state. Two saves overlapping,
 * or a read answering a moment out of date, silently undid work: a connected
 * account vanished, a deleted carousel came back, a seven-slide carousel kept
 * one slide. None of that is expressible here - a row is written on its own,
 * and a read of it is a read of it.
 *
 * Tokens keep the AES-GCM envelope the app already builds, so a database dump
 * never contains a usable credential. Row level security is on with no
 * policies, so only the service role reaches any of this.
 */
let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (client) return client;
  const { url, serviceKey } = config.supabase;
  if (!url || !serviceKey) {
    throw new Error("Supabase is not configured.");
  }
  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Throws with the operation named, since a bare PostgrestError says little. */
function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export class SupabaseStore implements EngineStore {
  readonly name = "Supabase Postgres";
  readonly persistent = true;

  // ------------------------------------------------------------------ pins

  async listPins(filter?: PinFilter): Promise<PinRecord[]> {
    const { data, error } = await db()
      .from("pins")
      .select("data")
      .order("created_at", { ascending: false });
    check("listing pins", error);
    const pins = (data ?? []).map((row) => row.data as PinRecord);
    // Filtering stays in one place so every adapter behaves identically.
    return applyFilter(pins, filter);
  }

  async getPin(id: string): Promise<PinRecord | null> {
    const { data, error } = await db()
      .from("pins")
      .select("data")
      .eq("id", id)
      .maybeSingle();
    check("reading a pin", error);
    return (data?.data as PinRecord) ?? null;
  }

  async findByDedupeKey(key: string): Promise<PinRecord | null> {
    const { data, error } = await db()
      .from("pins")
      .select("data")
      .eq("dedupe_key", key)
      .maybeSingle();
    check("looking up a duplicate", error);
    return (data?.data as PinRecord) ?? null;
  }

  async titlesForPlant(
    plantSlug: string,
    locale: ContentLocale,
  ): Promise<string[]> {
    const { data, error } = await db()
      .from("pins")
      .select("title")
      .eq("plant_slug", plantSlug)
      .eq("locale", locale)
      .order("created_at", { ascending: false });
    check("reading titles", error);
    return (data ?? [])
      .map((row) => row.title as string | null)
      .filter((t): t is string => Boolean(t));
  }

  async savePin(pin: PinRecord): Promise<void> {
    const { error } = await db().from("pins").upsert({
      id: pin.id,
      dedupe_key: pin.dedupeKey,
      locale: pin.locale,
      plant_slug: pin.plantSlug,
      angle_slug: pin.angleSlug,
      status: pin.status,
      title: pin.title,
      data: pin,
      created_at: pin.createdAt,
    });
    check("saving a pin", error);
  }

  async deletePin(id: string): Promise<void> {
    const { error } = await db().from("pins").delete().eq("id", id);
    check("deleting a pin", error);
  }

  // ----------------------------------------------------------- connections

  async getConnection(): Promise<PinterestConnection | null> {
    return this.openConnection("pinterest");
  }

  async setConnection(connection: PinterestConnection | null): Promise<void> {
    if (!connection) {
      const { error } = await db()
        .from("connections")
        .delete()
        .eq("provider", "pinterest");
      check("disconnecting Pinterest", error);
      return;
    }
    const { error } = await db().from("connections").upsert({
      provider: "pinterest",
      secret: encryptJson(connection),
      updated_at: new Date().toISOString(),
    });
    check("saving the Pinterest connection", error);
  }

  /**
   * A rotated or missing key degrades to "disconnected" rather than throwing,
   * because taking the whole dashboard down over it helps nobody.
   */
  private async openConnection<T>(provider: string): Promise<T | null> {
    const { data, error } = await db()
      .from("connections")
      .select("secret")
      .eq("provider", provider)
      .maybeSingle();
    check("reading a connection", error);
    const secret = data?.secret as string | undefined;
    if (!secret) return null;
    if (!hasEncryptionKey()) {
      console.warn(`[store] ${provider} is connected but the key is missing.`);
      return null;
    }
    try {
      return decryptJson<T>(secret);
    } catch {
      console.warn(`[store] the stored ${provider} connection will not open.`);
      return null;
    }
  }

  // ----------------------------------------------------------------- media

  async listMedia(filter?: MediaFilter): Promise<MediaAsset[]> {
    const { data, error } = await db()
      .from("media")
      .select("data")
      .order("created_at", { ascending: false });
    check("listing media", error);
    return filterMedia(
      (data ?? []).map((row) => row.data as MediaAsset),
      filter,
    );
  }

  async getMedia(id: string): Promise<MediaAsset | null> {
    const { data, error } = await db()
      .from("media")
      .select("data")
      .eq("id", id)
      .maybeSingle();
    check("reading media", error);
    return (data?.data as MediaAsset) ?? null;
  }

  async saveMedia(asset: MediaAsset): Promise<void> {
    await this.saveManyMedia([asset]);
  }

  async saveManyMedia(assets: MediaAsset[]): Promise<void> {
    if (assets.length === 0) return;
    const { error } = await db()
      .from("media")
      .upsert(
        assets.map((asset) => ({
          id: asset.id,
          plant_slug: asset.plantSlug,
          variety_slug: asset.varietySlug,
          source: asset.source,
          data: asset,
          created_at: asset.createdAt,
        })),
      );
    check("filing media", error);
  }

  async deleteMedia(id: string): Promise<void> {
    const { error } = await db().from("media").delete().eq("id", id);
    check("deleting media", error);
  }

  async markMediaUsed(id: string): Promise<void> {
    const asset = await this.getMedia(id);
    if (!asset) return;
    await this.saveMedia({
      ...asset,
      usedCount: asset.usedCount + 1,
      lastUsedAt: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------- tiktok accounts

  async listTikTokAccounts(): Promise<TikTokAccount[]> {
    const { data, error } = await db()
      .from("tiktok_accounts")
      .select("open_id, secret")
      .order("username");
    check("listing TikTok accounts", error);
    return (data ?? [])
      .map((row) => this.openAccount(row.secret as string))
      .filter((a): a is TikTokAccount => a !== null);
  }

  async getTikTokAccount(openId: string): Promise<TikTokAccount | null> {
    const { data, error } = await db()
      .from("tiktok_accounts")
      .select("secret")
      .eq("open_id", openId)
      .maybeSingle();
    check("reading a TikTok account", error);
    const secret = data?.secret as string | undefined;
    return secret ? this.openAccount(secret) : null;
  }

  async saveTikTokAccount(account: TikTokAccount): Promise<void> {
    const { error } = await db().from("tiktok_accounts").upsert({
      open_id: account.openId,
      username: account.username,
      display_name: account.displayName,
      avatar_url: account.avatarUrl,
      language: account.language,
      scopes: account.scopes,
      secret: encryptJson(account),
      profile_synced_at: account.profileSyncedAt ?? null,
      connected_at: account.connectedAt,
    });
    check("saving a TikTok account", error);
  }

  async deleteTikTokAccount(openId: string): Promise<void> {
    const { error } = await db()
      .from("tiktok_accounts")
      .delete()
      .eq("open_id", openId);
    check("disconnecting a TikTok account", error);
  }

  /** One account out of its envelope, or nothing if it will not open. */
  private openAccount(secret: string): TikTokAccount | null {
    if (!hasEncryptionKey()) return null;
    try {
      const raw = decryptJson<unknown>(secret);
      // Reuses the defensive reader, so an account stored under an older shape
      // still loads rather than breaking the list.
      const [account] = Object.values(normaliseAccounts({ one: raw }));
      return account ?? null;
    } catch {
      console.warn("[store] a stored TikTok account will not open.");
      return null;
    }
  }

  // ------------------------------------------------------------- carousels

  async listCarousels(): Promise<CarouselRecord[]> {
    const { data, error } = await db()
      .from("carousels")
      .select("*")
      .order("created_at", { ascending: false });
    check("listing carousels", error);
    return (data ?? [])
      .map((row) => normaliseCarousel(fromRow(row)))
      .filter((c): c is CarouselRecord => c !== null);
  }

  async getCarousel(id: string): Promise<CarouselRecord | null> {
    const { data, error } = await db()
      .from("carousels")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    check("reading a carousel", error);
    return data ? normaliseCarousel(fromRow(data)) : null;
  }

  async saveCarousel(carousel: CarouselRecord): Promise<void> {
    const { error } = await db().from("carousels").upsert({
      id: carousel.id,
      languages: carousel.languages,
      theme: carousel.theme,
      caption: carousel.caption,
      hashtags: carousel.hashtags,
      slides: carousel.slides,
      cover_index: carousel.coverIndex,
      plant_slug: carousel.plantSlug,
      plant_name: carousel.plantName,
      status: carousel.status,
      posts: carousel.posts,
      error: carousel.error,
      progress: carousel.progress,
      created_at: carousel.createdAt,
      updated_at: carousel.updatedAt,
    });
    check("saving a carousel", error);
  }

  async deleteCarousel(id: string): Promise<void> {
    const { error } = await db().from("carousels").delete().eq("id", id);
    check("deleting a carousel", error);
  }
}

/** A carousel row back into the shape the rest of the app speaks. */
function fromRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    languages: row.languages,
    theme: row.theme,
    caption: row.caption,
    hashtags: row.hashtags,
    slides: row.slides,
    coverIndex: row.cover_index,
    plantSlug: row.plant_slug,
    plantName: row.plant_name,
    status: row.status,
    posts: row.posts,
    error: row.error,
    progress: row.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

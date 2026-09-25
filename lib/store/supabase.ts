import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";
import { decryptJson, encryptJson, hasEncryptionKey } from "@/lib/crypto";
import { filterMedia, type MediaFilter } from "@/lib/media";
import type { ContentLocale } from "@/lib/i18n";
import type {
  CarouselRecord,
  Hook,
  MediaAsset,
  PinRecord,
  PinterestConnection,
  SlideTemplate,
  SpyAccount,
  SpyPost,
  SpyPostStatus,
  SpyRun,
  TikTokAccount,
} from "@/lib/types";
import {
  applyFilter,
  normaliseAccounts,
  normaliseCarousel,
  normaliseTemplate,
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
    throw new Error("Supabase n'est pas configuré.");
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
    check("lecture de la liste des Pins", error);
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
    check("lecture d'un Pin", error);
    return (data?.data as PinRecord) ?? null;
  }

  async findByDedupeKey(key: string): Promise<PinRecord | null> {
    const { data, error } = await db()
      .from("pins")
      .select("data")
      .eq("dedupe_key", key)
      .maybeSingle();
    check("recherche d'un doublon", error);
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
    check("lecture des titres", error);
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
    check("enregistrement d'un Pin", error);
  }

  async deletePin(id: string): Promise<void> {
    const { error } = await db().from("pins").delete().eq("id", id);
    check("suppression d'un Pin", error);
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
      check("déconnexion de Pinterest", error);
      return;
    }
    const { error } = await db().from("connections").upsert({
      provider: "pinterest",
      secret: encryptJson(connection),
      updated_at: new Date().toISOString(),
    });
    check("enregistrement de la connexion Pinterest", error);
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
    check("lecture d'une connexion", error);
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
      .order("created_at", { ascending: false })
      // Bounded, so one page can never try to hold the whole library at once.
      .limit(500);
    check("lecture de la bibliothèque d'images", error);
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
    check("lecture d'une image", error);
    return (data?.data as MediaAsset) ?? null;
  }

  async saveMedia(asset: MediaAsset): Promise<void> {
    await this.saveManyMedia([asset]);
  }

  async saveManyMedia(assets: MediaAsset[]): Promise<void> {
    if (assets.length === 0) return;

    /*
     * A row holds a link to an image, never the image.
     *
     * Without an image host the app falls back to inlining pictures as data
     * URLs, and writing those here put megabytes into a JSON column each -
     * enough that simply listing the library timed out and took the page down.
     * Refusing is the honest answer: the fix is an image store, not a bigger
     * row.
     */
    const inlined = assets.filter((a) => a.url.startsWith("data:"));
    if (inlined.length > 0) {
      throw new Error(
        "Les images sont intégrées au lieu d'être hébergées, elles ne peuvent pas être classées. Attache un store Blob.",
      );
    }

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
    check("classement des images", error);
  }

  async deleteMedia(id: string): Promise<void> {
    const { error } = await db().from("media").delete().eq("id", id);
    check("suppression d'une image", error);
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
    check("lecture de la liste des comptes TikTok", error);
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
    check("lecture d'un compte TikTok", error);
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
    check("enregistrement d'un compte TikTok", error);
  }

  async deleteTikTokAccount(openId: string): Promise<void> {
    const { error } = await db()
      .from("tiktok_accounts")
      .delete()
      .eq("open_id", openId);
    check("déconnexion d'un compte TikTok", error);
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
    check("lecture de la liste des carrousels", error);
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
    check("lecture d'un carrousel", error);
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
    check("enregistrement d'un carrousel", error);
  }

  async deleteCarousel(id: string): Promise<void> {
    const { error } = await db().from("carousels").delete().eq("id", id);
    check("suppression d'un carrousel", error);
  }

  // ------------------------------------------------------- saved slides

  async listSlideTemplates(): Promise<SlideTemplate[]> {
    const { data, error } = await db()
      .from("slide_templates")
      .select("data")
      .order("updated_at", { ascending: false });
    check("lecture des slides prêtes", error);
    return (data ?? [])
      .map((row) => normaliseTemplate(row.data))
      .filter((t): t is SlideTemplate => t !== null);
  }

  async getSlideTemplate(id: string): Promise<SlideTemplate | null> {
    const { data, error } = await db()
      .from("slide_templates")
      .select("data")
      .eq("id", id)
      .maybeSingle();
    check("lecture d'une slide prête", error);
    return data ? normaliseTemplate(data.data) : null;
  }

  async saveSlideTemplate(template: SlideTemplate): Promise<void> {
    const { error } = await db().from("slide_templates").upsert({
      id: template.id,
      data: template,
      created_at: template.createdAt,
      updated_at: template.updatedAt,
    });
    check("enregistrement d'une slide prête", error);
  }

  async deleteSlideTemplate(id: string): Promise<void> {
    const { error } = await db().from("slide_templates").delete().eq("id", id);
    check("suppression d'une slide prête", error);
  }

  // ----------------------------------------------------------------- hooks

  async listHooks(): Promise<Hook[]> {
    const { data, error } = await db()
      .from("hooks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    check("lecture des hooks", error);
    return (data ?? []).map(hookFromRow);
  }

  async getHook(id: string): Promise<Hook | null> {
    const { data, error } = await db().from("hooks").select("*").eq("id", id).maybeSingle();
    check("lecture d'un hook", error);
    return data ? hookFromRow(data) : null;
  }

  async findHookByKey(key: string): Promise<Hook | null> {
    const { data, error } = await db().from("hooks").select("*").eq("key", key).maybeSingle();
    check("recherche d'un hook", error);
    return data ? hookFromRow(data) : null;
  }

  async saveHook(hook: Hook): Promise<void> {
    const { error } = await db().from("hooks").upsert({
      id: hook.id,
      text: hook.text,
      key: hook.key,
      status: hook.status,
      source: hook.source,
      carousel_id: hook.carouselId,
      spy_post_id: hook.spyPostId,
      created_at: hook.createdAt,
      updated_at: hook.updatedAt,
      used_at: hook.usedAt,
    });
    check("enregistrement d'un hook", error);
  }

  async deleteHook(id: string): Promise<void> {
    const { error } = await db().from("hooks").delete().eq("id", id);
    check("suppression d'un hook", error);
  }

  // ------------------------------------------------------------------- spy

  async listSpyAccounts(): Promise<SpyAccount[]> {
    const { data, error } = await db().from("spy_accounts").select("*").order("username");
    check("lecture des comptes espionnés", error);
    return (data ?? []).map(spyAccountFromRow);
  }

  async saveSpyAccount(account: SpyAccount): Promise<void> {
    // The profile fields and the last pass belong to the script: the app only
    // ever writes what it decides.
    const { error } = await db().from("spy_accounts").upsert({
      username: account.username,
      enabled: account.enabled,
      note: account.note,
      added_at: account.addedAt,
    });
    check("enregistrement d'un compte espionné", error);
  }

  async deleteSpyAccount(username: string): Promise<void> {
    const { error } = await db().from("spy_accounts").delete().eq("username", username);
    check("suppression d'un compte espionné", error);
  }

  async listSpyPosts(): Promise<SpyPost[]> {
    const { data, error } = await db()
      .from("spy_posts")
      .select("*")
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(1000);
    check("lecture des carrousels espionnés", error);
    return (data ?? []).map(spyPostFromRow);
  }

  async getSpyPost(id: string): Promise<SpyPost | null> {
    const { data, error } = await db().from("spy_posts").select("*").eq("id", id).maybeSingle();
    check("lecture d'un carrousel espionné", error);
    return data ? spyPostFromRow(data) : null;
  }

  async setSpyPostStatus(
    id: string,
    status: SpyPostStatus,
    carouselId: string | null,
  ): Promise<void> {
    const { error } = await db()
      .from("spy_posts")
      .update({
        status,
        carousel_id: carouselId,
        handled_at: status === "new" ? null : new Date().toISOString(),
      })
      .eq("id", id);
    check("mise à jour d'un carrousel espionné", error);
  }

  async latestSpyRun(): Promise<SpyRun | null> {
    const { data, error } = await db()
      .from("spy_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    check("lecture du dernier passage du spy", error);
    if (!data) return null;
    return {
      id: String(data.id),
      startedAt: data.started_at as string,
      finishedAt: (data.finished_at as string | null) ?? null,
      accounts: Number(data.accounts ?? 0),
      found: Number(data.found ?? 0),
      added: Number(data.added ?? 0),
      errors: Array.isArray(data.errors) ? (data.errors as SpyRun["errors"]) : [],
      host: (data.host as string | null) ?? null,
    };
  }
}

function hookFromRow(row: Record<string, unknown>): Hook {
  return {
    id: row.id as string,
    text: row.text as string,
    key: row.key as string,
    status: row.status === "used" ? "used" : "idea",
    source: (row.source as Hook["source"]) ?? "manual",
    carouselId: (row.carousel_id as string | null) ?? null,
    spyPostId: (row.spy_post_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) ?? (row.created_at as string),
    usedAt: (row.used_at as string | null) ?? null,
  };
}

function spyAccountFromRow(row: Record<string, unknown>): SpyAccount {
  return {
    username: row.username as string,
    enabled: row.enabled !== false,
    note: (row.note as string | null) ?? null,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    followers: row.followers == null ? null : Number(row.followers),
    addedAt: row.added_at as string,
    lastCheckedAt: (row.last_checked_at as string | null) ?? null,
    lastStatus: (row.last_status as SpyAccount["lastStatus"]) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    lastFound: row.last_found == null ? null : Number(row.last_found),
  };
}

function spyPostFromRow(row: Record<string, unknown>): SpyPost {
  return {
    id: row.id as string,
    username: row.username as string,
    url: row.url as string,
    caption: (row.caption as string) ?? "",
    postedAt: (row.posted_at as string | null) ?? null,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    saves: Number(row.saves ?? 0),
    images: Array.isArray(row.images) ? (row.images as SpyPost["images"]) : [],
    status: (row.status as SpyPostStatus) ?? "new",
    carouselId: (row.carousel_id as string | null) ?? null,
    firstSeenAt: row.first_seen_at as string,
    statsUpdatedAt: row.stats_updated_at as string,
    handledAt: (row.handled_at as string | null) ?? null,
  };
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

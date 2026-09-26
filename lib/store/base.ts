import "server-only";
import { decryptJson, encryptJson, hasEncryptionKey } from "@/lib/crypto";
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
  TikTokAccounts,
} from "@/lib/types";
import { filterMedia, type MediaFilter } from "@/lib/media";
import type { ContentLocale } from "@/lib/i18n";
import {
  applyFilter,
  ConcurrentWrite,
  normaliseAccounts,
  normaliseCarousel,
  normaliseTemplate,
  type EngineStore,
  type PinFilter,
  type StateDocument,
  type VersionedDocument,
} from "./types";

/**
 * All adapters share the same document semantics and differ only in how they
 * load and persist one JSON document. Subclasses implement `read`/`write`.
 *
 * Writes are serialised through a promise chain: two concurrent generate calls
 * in the same instance would otherwise read-modify-write over each other and
 * silently drop a Pin. Instances it cannot serialise are caught after the
 * fact - see `mutate`.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A copy, so what is remembered cannot be mutated by a later caller. */
function clone(doc: StateDocument): StateDocument {
  return JSON.parse(JSON.stringify(doc)) as StateDocument;
}

export abstract class DocumentStore implements EngineStore {
  abstract readonly name: string;
  abstract readonly persistent: boolean;

  /** Loads the document with the token that identifies this exact version. */
  protected abstract loadRaw(): Promise<VersionedDocument>;
  /**
   * Persists the document. Must throw ConcurrentWrite - and write nothing - if
   * `version` no longer describes what is stored.
   */
  protected abstract store(
    doc: StateDocument,
    version: string | null,
  ): Promise<void>;

  /**
   * Loads the document, refusing to go backwards.
   *
   * Blob storage does not guarantee that a read immediately after a write sees
   * that write. When it does not, the effect is brutal and looks like
   * everything is broken at once: a connected account is not listed, a
   * language change appears not to take, a carousel that was just created is
   * not found. Nothing failed - the answer was simply a moment out of date.
   *
   * So each write is kept in memory with its revision, and a read that comes
   * back older than what this instance last wrote is answered from memory
   * instead. It closes the window for the operator clicking through the UI,
   * which is where it actually hurts.
   */
  protected async load(): Promise<VersionedDocument> {
    const fetched = await this.loadRaw();
    const mine = this.lastWrite;
    if (mine && (fetched.doc.revision ?? 0) < mine.revision) {
      return { doc: clone(mine.doc), version: fetched.version };
    }
    return fetched;
  }

  private lastWrite: { revision: number; doc: StateDocument } | null = null;

  /** The document alone, for the many callers that only read. */
  protected async read(): Promise<StateDocument> {
    return (await this.load()).doc;
  }

  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Serialises a read-modify-write cycle against this instance, and detects
   * the part it cannot serialise.
   *
   * A second serverless instance can read the same document and write it back
   * after us, erasing our change. So the write is conditional on the version
   * we read: the store refuses it if anything landed in between, and we
   * re-apply the mutation on top of the document that did land rather than let
   * either side vanish. Mutations are plain assignments into a freshly loaded
   * document, so re-applying one is safe.
   */
  protected mutate<T>(fn: (doc: StateDocument) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.applyMutation(fn, 6));
    // Keep the chain alive even if this link rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async applyMutation<T>(
    fn: (doc: StateDocument) => T | Promise<T>,
    attemptsLeft: number,
  ): Promise<T> {
    const { doc, version } = await this.load();
    const result = await fn(doc);
    doc.revision = (doc.revision ?? 0) + 1;

    try {
      await this.store(doc, version);
      this.lastWrite = { revision: doc.revision, doc: clone(doc) };
    } catch (err) {
      if (!(err instanceof ConcurrentWrite)) throw err;
      if (attemptsLeft <= 1) {
        // Never write anyway. A refused write loses one save and says so; an
        // unconditional one silently overwrites whatever won the race, which
        // is how composing a carousel ended up keeping one slide out of seven.
        throw err;
      }
      // A refusal can also mean the document we read was a moment stale, so
      // back off before reading it again rather than hammering the same
      // version straight back.
      await delay(120 * 2 ** (6 - attemptsLeft));
      return this.applyMutation(fn, attemptsLeft - 1);
    }
    return result;
  }

  async listPins(filter?: PinFilter): Promise<PinRecord[]> {
    const doc = await this.read();
    return applyFilter(Object.values(doc.pins), filter);
  }

  async getPin(id: string): Promise<PinRecord | null> {
    const doc = await this.read();
    return doc.pins[id] ?? null;
  }

  async findByDedupeKey(key: string): Promise<PinRecord | null> {
    const doc = await this.read();
    return Object.values(doc.pins).find((p) => p.dedupeKey === key) ?? null;
  }

  async titlesForPlant(plantSlug: string, locale: ContentLocale): Promise<string[]> {
    const doc = await this.read();
    return Object.values(doc.pins)
      .filter((p) => p.plantSlug === plantSlug && p.locale === locale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => p.title);
  }

  async savePin(pin: PinRecord): Promise<void> {
    await this.mutate((doc) => {
      doc.pins[pin.id] = pin;
    });
  }

  async deletePin(id: string): Promise<void> {
    await this.mutate((doc) => {
      delete doc.pins[id];
    });
  }

  async listMedia(filter?: MediaFilter): Promise<MediaAsset[]> {
    const doc = await this.read();
    return filterMedia(Object.values(doc.media ?? {}), filter);
  }

  async getMedia(id: string): Promise<MediaAsset | null> {
    const doc = await this.read();
    return doc.media?.[id] ?? null;
  }

  async saveMedia(asset: MediaAsset): Promise<void> {
    await this.mutate((doc) => {
      doc.media ??= {};
      doc.media[asset.id] = asset;
    });
  }

  async saveManyMedia(assets: MediaAsset[]): Promise<void> {
    if (assets.length === 0) return;
    await this.mutate((doc) => {
      doc.media ??= {};
      for (const asset of assets) doc.media[asset.id] = asset;
    });
  }

  async deleteMedia(id: string): Promise<void> {
    await this.mutate((doc) => {
      delete doc.media?.[id];
    });
  }

  async markMediaUsed(id: string): Promise<void> {
    await this.mutate((doc) => {
      const asset = doc.media?.[id];
      if (!asset) return;
      asset.usedCount += 1;
      asset.lastUsedAt = new Date().toISOString();
    });
  }

  async getConnection(): Promise<PinterestConnection | null> {
    return this.readConnection<PinterestConnection>(
      (doc) => doc.connection,
      "Pinterest",
    );
  }

  async setConnection(connection: PinterestConnection | null): Promise<void> {
    await this.mutate((doc) => {
      doc.connection = connection ? encryptJson(connection) : null;
    });
  }

  /**
   * Decrypts one stored connection envelope. Shared by both providers: a
   * rotated or missing key must degrade to "disconnected" rather than throwing
   * and taking the whole dashboard down.
   */
  private async readConnection<T>(
    pick: (doc: StateDocument) => string | null,
    label: string,
  ): Promise<T | null> {
    return this.openEnvelope<T>(pick(await this.read()), label);
  }

  private openEnvelope<T>(envelope: string | null, label: string): T | null {
    if (!envelope) return null;
    if (!hasEncryptionKey()) {
      console.warn(
        `[store] A ${label} connection exists but TOKEN_ENCRYPTION_KEY is unavailable.`,
      );
      return null;
    }
    try {
      return decryptJson<T>(envelope);
    } catch {
      console.warn(`[store] Stored ${label} connection could not be decrypted.`);
      return null;
    }
  }

  /**
   * All accounts live in one encrypted envelope rather than one each: they are
   * read together on every publish, and a single blob keeps that to one
   * decrypt instead of N.
   */
  private async readAccounts(): Promise<TikTokAccounts> {
    return this.accountsIn(await this.read());
  }

  /**
   * The accounts held in a document, or a refusal.
   *
   * An envelope that exists but will not open means the key is wrong, not that
   * there are no accounts. Reading that as an empty map would let connecting
   * one account quietly erase every other, so it throws instead.
   */
  private accountsIn(doc: StateDocument): TikTokAccounts {
    const envelope = doc.tiktok ?? null;
    const opened = this.openEnvelope<unknown>(envelope, "TikTok");
    if (envelope && opened === null) {
      throw new Error(
        "Impossible de déchiffrer les comptes TikTok enregistrés. Ils ne seront pas écrasés : vérifie TOKEN_ENCRYPTION_KEY.",
      );
    }
    return normaliseAccounts(opened);
  }

  async listTikTokAccounts(): Promise<TikTokAccount[]> {
    return Object.values(await this.readAccounts()).sort((a, b) =>
      a.username.localeCompare(b.username),
    );
  }

  async getTikTokAccount(openId: string): Promise<TikTokAccount | null> {
    return (await this.readAccounts())[openId] ?? null;
  }

  async saveTikTokAccount(account: TikTokAccount): Promise<void> {
    await this.mutate((doc) => {
      const accounts = this.accountsIn(doc);
      accounts[account.openId] = account;
      doc.tiktok = encryptJson(accounts);
    });
  }

  async deleteTikTokAccount(openId: string): Promise<void> {
    await this.mutate((doc) => {
      const accounts = this.accountsIn(doc);
      delete accounts[openId];
      doc.tiktok =
        Object.keys(accounts).length > 0 ? encryptJson(accounts) : null;
    });
  }

  async listCarousels(): Promise<CarouselRecord[]> {
    const doc = await this.read();
    return Object.values(doc.carousels ?? {})
      .map(normaliseCarousel)
      .filter((c): c is CarouselRecord => c !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getCarousel(id: string): Promise<CarouselRecord | null> {
    const doc = await this.read();
    return normaliseCarousel(doc.carousels?.[id]);
  }

  async saveCarousel(carousel: CarouselRecord): Promise<void> {
    await this.mutate((doc) => {
      doc.carousels ??= {};
      doc.carousels[carousel.id] = carousel;
    });
  }

  async deleteCarousel(id: string): Promise<void> {
    await this.mutate((doc) => {
      delete doc.carousels?.[id];
    });
  }

  async listSlideTemplates(): Promise<SlideTemplate[]> {
    const doc = await this.read();
    return Object.values(doc.slideTemplates ?? {})
      .map(normaliseTemplate)
      .filter((t): t is SlideTemplate => t !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSlideTemplate(id: string): Promise<SlideTemplate | null> {
    const doc = await this.read();
    return normaliseTemplate(doc.slideTemplates?.[id]);
  }

  async saveSlideTemplate(template: SlideTemplate): Promise<void> {
    await this.mutate((doc) => {
      doc.slideTemplates ??= {};
      doc.slideTemplates[template.id] = template;
    });
  }

  async deleteSlideTemplate(id: string): Promise<void> {
    await this.mutate((doc) => {
      delete doc.slideTemplates?.[id];
    });
  }

  // ----------------------------------------------------------------- hooks

  async listHooks(): Promise<Hook[]> {
    const doc = await this.read();
    return Object.values(doc.hooks ?? {}).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async getHook(id: string): Promise<Hook | null> {
    const doc = await this.read();
    return doc.hooks?.[id] ?? null;
  }

  async findHookByKey(key: string): Promise<Hook | null> {
    const doc = await this.read();
    return Object.values(doc.hooks ?? {}).find((h) => h.key === key) ?? null;
  }

  async saveHook(hook: Hook): Promise<void> {
    await this.mutate((doc) => {
      doc.hooks ??= {};
      doc.hooks[hook.id] = hook;
    });
  }

  async deleteHook(id: string): Promise<void> {
    await this.mutate((doc) => {
      delete doc.hooks?.[id];
    });
  }

  // ------------------------------------------------------------------- spy

  async listSpyAccounts(): Promise<SpyAccount[]> {
    const doc = await this.read();
    return Object.values(doc.spyAccounts ?? {}).sort((a, b) =>
      a.username.localeCompare(b.username),
    );
  }

  async saveSpyAccount(account: SpyAccount): Promise<void> {
    await this.mutate((doc) => {
      doc.spyAccounts ??= {};
      doc.spyAccounts[account.username] = account;
    });
  }

  async updateSpyAccountFields(
    username: string,
    fields: Partial<Pick<SpyAccount, "enabled" | "note" | "team">>,
  ): Promise<void> {
    await this.mutate((doc) => {
      const account = doc.spyAccounts?.[username];
      if (account) doc.spyAccounts![username] = { ...account, ...fields };
    });
  }

  async deleteSpyAccount(username: string): Promise<void> {
    await this.mutate((doc) => {
      delete doc.spyAccounts?.[username];
    });
  }

  async deleteSpyPostsOf(username: string): Promise<void> {
    await this.mutate((doc) => {
      for (const [id, post] of Object.entries(doc.spyPosts ?? {})) {
        if (post.username === username) delete doc.spyPosts![id];
      }
    });
  }

  async removeSpyPost(id: string, _reason: string): Promise<void> {
    // Offline: no spy runs to keep it away from, only the post to set aside.
    await this.mutate((doc) => {
      const post = doc.spyPosts?.[id];
      if (post) doc.spyPosts![id] = { ...post, images: [], removed: true };
    });
  }

  async listSpyPosts(): Promise<SpyPost[]> {
    const doc = await this.read();
    return Object.values(doc.spyPosts ?? {}).sort((a, b) =>
      (b.postedAt ?? b.firstSeenAt).localeCompare(a.postedAt ?? a.firstSeenAt),
    );
  }

  async getSpyPost(id: string): Promise<SpyPost | null> {
    const doc = await this.read();
    return doc.spyPosts?.[id] ?? null;
  }

  async setSpyPostStatus(
    id: string,
    status: SpyPostStatus,
    carouselId: string | null,
  ): Promise<void> {
    await this.mutate((doc) => {
      const post = doc.spyPosts?.[id];
      if (!post) return;
      post.status = status;
      post.carouselId = carouselId;
      post.handledAt = status === "new" ? null : new Date().toISOString();
    });
  }

  /** One process holds this document, so a claim is simply "not read yet". */
  async claimSpyPostHook(id: string): Promise<boolean> {
    const doc = await this.read();
    const post = doc.spyPosts?.[id];
    return Boolean(post && !post.hookCheckedAt);
  }

  async releaseSpyPostHook(): Promise<void> {
    // Nothing is held: see claimSpyPostHook.
  }

  async setSpyPostHook(
    id: string,
    hook: { text: string; lang: string | null; format: string | null; fr: string | null },
  ): Promise<void> {
    await this.mutate((doc) => {
      const post = doc.spyPosts?.[id];
      if (!post) return;
      post.hookText = hook.text;
      post.hookLang = hook.lang;
      post.hookFormat = hook.format as SpyPost["hookFormat"];
      post.hookFr = hook.fr;
      post.hookCheckedAt = new Date().toISOString();
    });
  }

  async latestSpyRun(): Promise<SpyRun | null> {
    const doc = await this.read();
    const runs = [...(doc.spyRuns ?? [])].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
    return runs[0] ?? null;
  }

}

import "server-only";
import { decryptJson, encryptJson, hasEncryptionKey } from "@/lib/crypto";
import type {
  CarouselRecord,
  MediaAsset,
  PinRecord,
  PinterestConnection,
  TikTokAccount,
  TikTokAccounts,
} from "@/lib/types";
import { filterMedia, type MediaFilter } from "@/lib/media";
import type { Locale } from "@/lib/i18n";
import {
  applyFilter,
  emptyState,
  type EngineStore,
  type PinFilter,
  type StateDocument,
} from "./types";

/**
 * All adapters share the same document semantics and differ only in how they
 * load and persist one JSON document. Subclasses implement `read`/`write`.
 *
 * Writes are serialised through a promise chain: two concurrent generate calls
 * in the same instance would otherwise read-modify-write over each other and
 * silently drop a Pin.
 */
export abstract class DocumentStore implements EngineStore {
  abstract readonly name: string;
  abstract readonly persistent: boolean;

  protected abstract read(): Promise<StateDocument>;
  protected abstract write(doc: StateDocument): Promise<void>;

  private queue: Promise<unknown> = Promise.resolve();

  /** Serialises a read-modify-write cycle against this instance. */
  protected mutate<T>(fn: (doc: StateDocument) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const doc = await this.read();
      const result = await fn(doc);
      await this.write(doc);
      return result;
    });
    // Keep the chain alive even if this link rejects.
    this.queue = run.catch(() => undefined);
    return run;
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

  async titlesForPlant(plantSlug: string, locale: Locale): Promise<string[]> {
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
    const doc = await this.read();
    const envelope = pick(doc);
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
    return (
      (await this.readConnection<TikTokAccounts>(
        (doc) => doc.tiktok ?? null,
        "TikTok",
      )) ?? {}
    );
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
    const accounts = await this.readAccounts();
    accounts[account.openId] = account;
    await this.mutate((doc) => {
      doc.tiktok = encryptJson(accounts);
    });
  }

  async deleteTikTokAccount(openId: string): Promise<void> {
    const accounts = await this.readAccounts();
    delete accounts[openId];
    await this.mutate((doc) => {
      doc.tiktok = Object.keys(accounts).length > 0 ? encryptJson(accounts) : null;
    });
  }

  async listCarousels(): Promise<CarouselRecord[]> {
    const doc = await this.read();
    return Object.values(doc.carousels ?? {}).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async getCarousel(id: string): Promise<CarouselRecord | null> {
    const doc = await this.read();
    return doc.carousels?.[id] ?? null;
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

  protected fallback(): StateDocument {
    return emptyState();
  }
}

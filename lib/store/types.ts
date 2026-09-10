import type {
  CarouselRecord,
  MediaAsset,
  PinRecord,
  PinStatus,
  PinterestConnection,
  TikTokAccount,
} from "@/lib/types";
import type { MediaFilter } from "@/lib/media";
import { normaliseOverlay } from "@/lib/overlay";
import type { ContentLocale } from "@/lib/i18n";

export interface PinFilter {
  locale?: ContentLocale;
  plantSlug?: string;
  angleSlug?: string;
  status?: PinStatus;
  search?: string;
  limit?: number;
}

/**
 * Storage abstraction (spec §21).
 *
 * The MVP deliberately avoids a database. This interface is the seam that lets
 * a Postgres/Supabase adapter drop in for Phase 4 scheduling without touching
 * a single route handler.
 *
 * Implementations must persist the connection payload ENCRYPTED - see
 * lib/crypto.ts. No adapter ever receives a plaintext token.
 */
export interface EngineStore {
  /** Human-readable adapter name, surfaced on the dashboard. */
  readonly name: string;
  /** False for the in-memory dev adapter, which loses data between requests. */
  readonly persistent: boolean;

  listPins(filter?: PinFilter): Promise<PinRecord[]>;
  getPin(id: string): Promise<PinRecord | null>;
  findByDedupeKey(key: string): Promise<PinRecord | null>;
  /**
   * Titles recorded for a plant in one language - feeds the "don't repeat
   * yourself" prompt. Scoped by locale, since a French title is no constraint
   * on an English one.
   */
  titlesForPlant(plantSlug: string, locale: ContentLocale): Promise<string[]>;
  savePin(pin: PinRecord): Promise<void>;
  deletePin(id: string): Promise<void>;

  getConnection(): Promise<PinterestConnection | null>;
  setConnection(connection: PinterestConnection | null): Promise<void>;

  /** Media library - generated images, indexed by plant and cultivar. */
  listMedia(filter?: MediaFilter): Promise<MediaAsset[]>;
  getMedia(id: string): Promise<MediaAsset | null>;
  saveMedia(asset: MediaAsset): Promise<void>;
  /**
   * Files several assets in ONE document write. Composing a carousel produces
   * one composite per slide per language, and doing that as a write each was
   * how a seven-slide carousel ended up storing one.
   */
  saveManyMedia(assets: MediaAsset[]): Promise<void>;
  deleteMedia(id: string): Promise<void>;
  /** Bumps reuse accounting when an asset backs a new Pin or slide. */
  markMediaUsed(id: string): Promise<void>;

  /** Every connected TikTok account, keyed by open id. */
  listTikTokAccounts(): Promise<TikTokAccount[]>;
  getTikTokAccount(openId: string): Promise<TikTokAccount | null>;
  saveTikTokAccount(account: TikTokAccount): Promise<void>;
  deleteTikTokAccount(openId: string): Promise<void>;

  listCarousels(): Promise<CarouselRecord[]>;
  getCarousel(id: string): Promise<CarouselRecord | null>;
  saveCarousel(carousel: CarouselRecord): Promise<void>;
  deleteCarousel(id: string): Promise<void>;
}

/** Shape of the single persisted state document. */
export interface StateDocument {
  version: 1;
  pins: Record<string, PinRecord>;
  media: Record<string, MediaAsset>;
  carousels: Record<string, CarouselRecord>;
  /** AES-256-GCM envelope produced by lib/crypto.ts, or null when disconnected. */
  connection: string | null;
  /** Same envelope, for the TikTok account. */
  tiktok: string | null;
}

/**
 * A document together with whatever the adapter needs to tell whether it has
 * changed since - an ETag on Blob, nothing at all where the process is the
 * only writer.
 */
export interface VersionedDocument {
  doc: StateDocument;
  version: string | null;
}

/** Thrown when the document moved under a writer between load and store. */
export class ConcurrentWrite extends Error {
  constructor() {
    super("The state document changed while this write was being prepared.");
    this.name = "ConcurrentWrite";
  }
}

export function emptyState(): StateDocument {
  return {
    version: 1,
    pins: {},
    media: {},
    carousels: {},
    connection: null,
    tiktok: null,
  };
}

/** Shared filter/sort logic so every adapter behaves identically. */
export function applyFilter(
  pins: PinRecord[],
  filter: PinFilter = {},
): PinRecord[] {
  let out = pins;

  if (filter.locale) out = out.filter((p) => p.locale === filter.locale);
  if (filter.plantSlug) out = out.filter((p) => p.plantSlug === filter.plantSlug);
  if (filter.angleSlug) out = out.filter((p) => p.angleSlug === filter.angleSlug);
  if (filter.status) out = out.filter((p) => p.status === filter.status);

  if (filter.search) {
    const q = filter.search.toLowerCase().trim();
    out = out.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.plantName.toLowerCase().includes(q) ||
        p.keywords.some((k) => k.includes(q)),
    );
  }

  out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return filter.limit ? out.slice(0, filter.limit) : out;
}


/**
 * Brings a stored carousel up to the current shape.
 *
 * Records written before carousels became multilingual and multi-account lack
 * `languages`, `posts`, and per-language slide text. Reading one crashed the
 * page rather than degrading, which is the wrong failure: stored data outlives
 * every schema, so the reader has to tolerate what the writer used to produce.
 */
/**
 * A generation runs detached from the request that started it. If that
 * function is killed - a timeout, a redeploy mid-run - nothing is left to
 * write the failure down, and the record would spin on "generating" forever
 * with no way to tell it apart from one still working. Progress is written
 * after every slide, so a long silence is the signal.
 */
const STALE_GENERATION_MS = 15 * 60 * 1000;

export function normaliseCarousel(raw: unknown): CarouselRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, any>;
  if (typeof c.id !== "string") return null;

  const languages: ContentLocale[] = Array.isArray(c.languages)
    ? c.languages
    : // Older records carried a single `locale`.
      [(c.locale as ContentLocale) ?? "en"];
  const primary = languages[0] ?? "en";

  const slides = Array.isArray(c.slides)
    ? c.slides.map((s: Record<string, any>) => ({
        kind: s?.kind ?? "content",
        hasPlenovaMention: Boolean(s?.hasPlenovaMention),
        text:
          s?.text && typeof s.text === "object"
            ? s.text
            : // Flat title/subtitle became a per-language dictionary.
              { [primary]: { title: s?.title ?? "", subtitle: s?.subtitle ?? "" } },
        overlay: normaliseOverlay(s?.overlay),
        imagePrompt: s?.imagePrompt ?? "",
        photoQuery: s?.photoQuery ?? "",
        mediaId: s?.mediaId ?? null,
        imageUrl: s?.imageUrl ?? null,
        composed:
          s?.composed && typeof s.composed === "object"
            ? s.composed
            : s?.composedUrl
              ? { [primary]: s.composedUrl }
              : {},
      }))
    : [];

  const lastTouched = Date.parse(c.updatedAt ?? "");
  const stalled =
    c.status === "generating" &&
    Number.isFinite(lastTouched) &&
    Date.now() - lastTouched > STALE_GENERATION_MS;

  return {
    id: c.id,
    languages,
    theme: c.theme ?? c.title ?? "",
    caption:
      c.caption && typeof c.caption === "object"
        ? c.caption
        : { [primary]: c.description ?? "" },
    hashtags:
      c.hashtags && !Array.isArray(c.hashtags) && typeof c.hashtags === "object"
        ? c.hashtags
        : { [primary]: Array.isArray(c.hashtags) ? c.hashtags : [] },
    slides,
    coverIndex: typeof c.coverIndex === "number" ? c.coverIndex : 1,
    plantSlug: c.plantSlug ?? null,
    plantName: c.plantName ?? null,
    status: stalled ? "failed" : (c.status ?? "draft"),
    posts: Array.isArray(c.posts) ? c.posts : [],
    error: stalled
      ? "Generation stopped responding and was abandoned. Start it again."
      : (c.error ?? null),
    progress: stalled ? null : (c.progress ?? null),
    createdAt: c.createdAt ?? new Date(0).toISOString(),
    updatedAt: c.updatedAt ?? new Date(0).toISOString(),
  } as CarouselRecord;
}

/**
 * Brings a decrypted TikTok envelope up to the current shape.
 *
 * It used to hold one connection; it now holds a map keyed by open id. Reading
 * the old form as a map yielded its own field values as if they were accounts.
 */
export function normaliseAccounts(raw: unknown): Record<string, TikTokAccount> {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, any>;

  // A single connection: it has a token at the top level rather than under a key.
  if (typeof value.accessToken === "string") {
    const openId = typeof value.openId === "string" ? value.openId : "";
    if (!openId) return {};
    return {
      [openId]: { ...(value as TikTokAccount), language: value.language ?? "en" },
    };
  }

  const out: Record<string, TikTokAccount> = {};
  for (const [key, account] of Object.entries(value)) {
    if (account && typeof account === "object" && typeof account.accessToken === "string") {
      out[key] = { ...(account as TikTokAccount), language: account.language ?? "en" };
    }
  }
  return out;
}

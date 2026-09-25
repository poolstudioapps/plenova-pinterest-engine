import type {
  CarouselRecord,
  Hook,
  MediaAsset,
  PinRecord,
  PinStatus,
  PinterestConnection,
  SlideTemplate,
  SpyAccount,
  SpyPost,
  SpyPostStatus,
  SpyRun,
  TikTokAccount,
} from "@/lib/types";
import { cleanSlideTexts } from "@/lib/slide-text";
import { normaliseSearch, type MediaFilter } from "@/lib/media";
import { plantIdentity } from "@/lib/data/localize";
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

  /** Slides kept ready for any carousel - the CTA, mostly. Newest edit first. */
  listSlideTemplates(): Promise<SlideTemplate[]>;
  getSlideTemplate(id: string): Promise<SlideTemplate | null>;
  saveSlideTemplate(template: SlideTemplate): Promise<void>;
  deleteSlideTemplate(id: string): Promise<void>;

  /** Cover lines, ours and seen elsewhere. Newest first. */
  listHooks(): Promise<Hook[]>;
  getHook(id: string): Promise<Hook | null>;
  findHookByKey(key: string): Promise<Hook | null>;
  saveHook(hook: Hook): Promise<void>;
  deleteHook(id: string): Promise<void>;

  /** Accounts the local spy script visits. */
  listSpyAccounts(): Promise<SpyAccount[]>;
  saveSpyAccount(account: SpyAccount): Promise<void>;
  deleteSpyAccount(username: string): Promise<void>;

  /** Carousels the spy found, newest post first. */
  listSpyPosts(): Promise<SpyPost[]>;
  getSpyPost(id: string): Promise<SpyPost | null>;
  /**
   * Only what the app decides about a post. Its numbers belong to the script,
   * which rewrites them every day, so the app never writes them back.
   */
  setSpyPostStatus(
    id: string,
    status: SpyPostStatus,
    carouselId: string | null,
  ): Promise<void>;
  /**
   * Reserves a post's cover for reading, for a few minutes. False when it is
   * already read, or another reader - the app or the script - holds it.
   */
  claimSpyPostHook(id: string): Promise<boolean>;
  /** Gives a reserved cover back, after a reading that failed. */
  releaseSpyPostHook(id: string): Promise<void>;
  /** Records the hook read on a post's first slide ("" when there was none). */
  setSpyPostHook(
    id: string,
    hook: { text: string; lang: string | null; format: string | null; fr: string | null },
  ): Promise<void>;
  latestSpyRun(): Promise<SpyRun | null>;
}

/** Shape of the single persisted state document. */
export interface StateDocument {
  version: 1;
  pins: Record<string, PinRecord>;
  media: Record<string, MediaAsset>;
  carousels: Record<string, CarouselRecord>;
  /** Absent on documents written before saved slides existed. */
  slideTemplates?: Record<string, SlideTemplate>;
  /** Local stand-ins for the Supabase tables, for offline development. */
  hooks?: Record<string, Hook>;
  spyAccounts?: Record<string, SpyAccount>;
  spyPosts?: Record<string, SpyPost>;
  spyRuns?: SpyRun[];
  /** AES-256-GCM envelope produced by lib/crypto.ts, or null when disconnected. */
  connection: string | null;
  /** Same envelope, for the TikTok account. */
  tiktok: string | null;
  /**
   * Incremented on every write. Not a lock - a freshness marker, so a read
   * that answers with an older document than this process just wrote can be
   * recognised as stale instead of believed.
   */
  revision?: number;
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
    /*
     * The botanical name and the French aliases are part of the haystack.
     *
     * Once both names are printed next to each other, the operator types
     * either one - and "langue de belle-mere" or "Dracaena trifasciata"
     * finding nothing, while "Sansevieria" works, reads as a broken search.
     * Accent-insensitive for the same reason.
     */
    const q = normaliseSearch(filter.search);
    out = out.filter((p) => {
      const identity = plantIdentity({
        slug: p.plantSlug,
        fallbackName: p.plantName,
        variety: p.variety,
      });
      return (
        normaliseSearch(`${p.title} ${p.description}`).includes(q) ||
        identity.search.includes(q) ||
        p.keywords.some((k) => normaliseSearch(k).includes(q))
      );
    });
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

/** A stored saved slide, whatever shape it was written in, or null. */
export function normaliseTemplate(raw: unknown): SlideTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.mediaId !== "string") return null;
  const created = typeof t.createdAt === "string" ? t.createdAt : new Date(0).toISOString();
  return {
    id: t.id,
    name: typeof t.name === "string" && t.name.trim() ? t.name : "Slide",
    kind: t.kind === "cta" ? "cta" : "content",
    mediaId: t.mediaId,
    imageUrl: typeof t.imageUrl === "string" ? t.imageUrl : "",
    overlay: normaliseOverlay(t.overlay),
    text: cleanSlideTexts(t.text),
    createdAt: created,
    updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : created,
  };
}

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
      [openId]: {
        ...(value as TikTokAccount),
        language: value.language ?? "en",
      },
    };
  }

  const out: Record<string, TikTokAccount> = {};
  for (const [key, account] of Object.entries(value)) {
    if (account && typeof account === "object" && typeof account.accessToken === "string") {
      out[key] = {
        ...(account as TikTokAccount),
        language: account.language ?? "en",
      };
    }
  }
  return out;
}

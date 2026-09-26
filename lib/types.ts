/** Shared domain types for the Pinterest engine. */

import type { ContentLocale } from "@/lib/i18n";
import type { SlideOverlay } from "@/lib/overlay";

export type Difficulty = "easy" | "medium" | "hard";

export interface Plant {
  slug: string;
  name: string;
  scientificName?: string;
  difficulty: Difficulty;
  light: string;
  watering: string;
  humidity?: string;
  shortDescription?: string;
  commonProblems: string[];
  seasonalNotes?: string;
  /** Visual anchors handed to the image model so each species looks correct. */
  visualTraits?: string;
  petFriendly?: boolean;
  lowLightTolerant?: boolean;
}

export type AngleCategory =
  | "care"
  | "problems"
  | "mistakes"
  | "discovery"
  | "seasonal";

export interface ContentAngle {
  slug: string;
  label: string;
  category: AngleCategory;
  /** Extra intent passed to the copy model. */
  intent: string;
  /** Scene direction handed to the image model. */
  sceneDirection: string;
  /** Angles that describe a collection rather than one species. */
  speciesAgnostic?: boolean;
}

export interface VisualStyle {
  slug: string;
  label: string;
  /** Composition direction injected into the image prompt. */
  direction: string;
  /** If true the design intentionally carries typography. */
  hasTypography?: boolean;
}

export type PinStatus =
  | "draft"
  | "generated"
  | "queued"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export interface PinRecord {
  id: string;
  /** Language the Pin copy is written in. */
  locale: ContentLocale;
  /** Stable hash of plant+angle+style+variation, used for duplicate detection. */
  dedupeKey: string;
  plantSlug: string;
  /** Plant name as rendered in this Pin's locale. */
  plantName: string;
  angleSlug: string;
  angleLabel: string;
  visualStyle: string;
  variation: number;
  /** Free-form cultivar this Pin targets, if any. */
  variety: string | null;
  /** The media library asset backing this Pin. */
  mediaId: string | null;

  title: string;
  description: string;
  keywords: string[];
  altText: string;
  imagePrompt: string;

  imageUrl: string | null;
  /** True when imageUrl is a data: URL (local dev without Blob storage). */
  imageIsInline: boolean;

  link: string;
  boardId: string | null;
  boardName: string | null;

  status: PinStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  pinterestPinId: string | null;
  error: string | null;
  attempts: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * A generated image, indexed so it can be found again and reused.
 *
 * This is the bridge between channels: a plant photograph paid for once by a
 * Pinterest Pin can back a TikTok carousel slide later, instead of paying
 * Gemini again for the same subject.
 *
 * Indexed by plant AND by free-form variety, because cultivars people actually
 * search - "variegata", "Thai Constellation", "albo" - are not catalog entries
 * and never will be. The catalog stays curated; the media library does not.
 */
export type MediaRole = "cta" | "hook";

export interface MediaAsset {
  id: string;
  plantSlug: string;
  plantName: string;
  /** Free-form cultivar, e.g. "variegata". Empty for the plain species. */
  variety: string | null;
  /** Slugified variety, used in the storage path. */
  varietySlug: string | null;

  url: string;
  mimeType: string;
  /** "2:3" for Pinterest, "4:5" for a TikTok carousel slide. */
  aspectRatio: string;

  /** The prompt that produced it - lets you regenerate a close variant. */
  prompt: string;
  visualStyle: string;
  angleSlug: string | null;
  /** Where it came from, so an uploaded asset is distinguishable. */
  source: "pin" | "carousel" | "upload";
  /**
   * What the image is FOR, when that is not "a photograph of this species".
   *
   *  - "cta":  a Plenova call-to-action image the operator prepared and
   *            uploaded. Goes on the slide carrying the Plenova mention.
   *  - "hook": an opening or closing image - a mood shot rather than a
   *            specimen. Goes on the first and last slides of a carousel built
   *            from the library.
   *
   * Absent on everything filed before roles existed. An image whose species
   * the catalog does not know is treated as a hook without needing this set:
   * a plant nobody can name is exactly the generic green shot a cover wants.
   */
  role?: MediaRole | null;
  sourceId: string | null;
  /**
   * Credit for the photograph used as a visual reference, when one was.
   * Nothing from the reference is republished, but recording it keeps the
   * provenance of every image traceable.
   */
  referencePhotographer?: string | null;

  tags: string[];
  /** Reuse accounting, so the picker can avoid always serving the same shot. */
  usedCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface PinterestBoard {
  id: string;
  name: string;
  privacy?: string;
  pinCount?: number;
}

export interface PinterestAccount {
  username: string;
  accountType?: string;
  profileImage?: string;
}

export interface PinterestConnection {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds. */
  expiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  scopes: string[];
  account: PinterestAccount | null;
  connectedAt: string;
}

/**
 * One connected TikTok account. Tokens live encrypted, same as Pinterest.
 *
 * Several accounts are connected at once and each posts in its own language,
 * which is the whole point of generating a carousel in five languages: one
 * production run feeds every account.
 */
export interface TikTokAccount {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  scopes: string[];
  openId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** The language this account publishes in. */
  language: ContentLocale;
  /**
   * When the profile was last read from TikTok, or null if it never was.
   *
   * Gating the repair pass on a fact rather than on a missing name matters:
   * an account labelled with a placeholder looks named, so keying on the
   * label made the pass skip exactly the accounts that needed it.
   */
  profileSyncedAt?: string | null;
  connectedAt: string;
}

/** Every connected account, keyed by TikTok's open id. */
export type TikTokAccounts = Record<string, TikTokAccount>;

/**
 * Creator state, queried immediately before a direct post.
 *
 * TikTok audits this: the privacy options must be rendered from the live
 * response and the operator's choice honoured, never hard-coded.
 */
export interface TikTokCreatorInfo {
  nickname: string;
  avatarUrl: string | null;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxTitleLength: number;
  maxVideoDuration: number;
}

export type CarouselStatus =
  /** Slides are being written and illustrated on the server. */
  | "generating"
  | "draft"
  | "publishing"
  | "published"
  | "failed";

/**
 * One slide of a carousel.
 *
 * Gemini writes all four text fields; the image is generated from imagePrompt
 * and lands in the media library like any other, so it can be reused later.
 */
/** Overlay copy for one slide, in one language. */
export interface SlideText {
  title: string;
  subtitle: string;
  /**
   * The Plenova mention, on the one content slide that carries it. Its own
   * line rather than a clause bolted onto the subtitle, so it can be styled
   * and placed like the recommendation it is meant to read as.
   */
  cta?: string;
}

export interface CarouselSlide {
  kind: "hook" | "content" | "cta";
  /** True on the one content slide that also mentions Plenova. */
  hasPlenovaMention?: boolean;
  /** Overlay copy per language. One image, several texts over it. */
  text: Partial<Record<ContentLocale, SlideText>>;
  /**
   * Where the words sit and how they look. Shared across languages on purpose:
   * a slide is one design, and only the words in it change.
   */
  overlay?: SlideOverlay;
  imagePrompt: string;
  photoQuery: string;
  mediaId: string | null;
  /** The bare photograph, which stays reusable by other carousels. */
  imageUrl: string | null;
  /**
   * The photograph with its text burned in, one per language. The image is
   * shared; only the words differ, so each language needs its own composite.
   */
  composed: Partial<Record<ContentLocale, string>>;
}

/**
 * A slide kept ready to drop into any carousel - typically the Plenova CTA: a
 * photograph from the library, its layout, and its words in every language it
 * was written in. Inserted into a carousel, it brings that carousel's
 * languages; one it was never written in comes in empty, and the editor says so.
 */
export interface SlideTemplate {
  id: string;
  name: string;
  /** "cta" carries the Plenova mention; "content" is any other slide. */
  kind: "cta" | "content";
  mediaId: string;
  imageUrl: string;
  overlay: SlideOverlay;
  /** Only the languages that were written. */
  text: Partial<Record<ContentLocale, SlideText>>;
  createdAt: string;
  updatedAt: string;
}

/** A TikTok photo carousel: ordered slides plus one caption. */
export interface CarouselRecord {
  id: string;
  /** Languages this carousel was written in. */
  languages: ContentLocale[];
  /** The theme the operator asked for, kept so it is not repeated later. */
  theme: string;
  /** Caption per language, hashtags included at the end. */
  caption: Partial<Record<ContentLocale, string>>;
  hashtags: Partial<Record<ContentLocale, string[]>>;
  slides: CarouselSlide[];
  /** 1-indexed, as TikTok expects. */
  coverIndex: number;

  plantSlug: string | null;
  plantName: string | null;

  status: CarouselStatus;

  /** One entry per account the carousel has been posted to. */
  posts: CarouselPost[];
  /** Set while generating, and on failure. */
  error: string | null;
  /** Slides finished so far, so progress survives a page reload. */
  progress: { done: number; total: number } | null;

  createdAt: string;
  updatedAt: string;
}

/** The outcome of posting one carousel to one account. */
export interface CarouselPost {
  openId: string;
  username: string;
  language: ContentLocale;
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  privacyLevel: string | null;
  brandContentToggle: boolean;
  brandOrganicToggle: boolean;
  publishId: string | null;
  publishedAt: string | null;
  /**
   * Accepted is not published. TikTok pulls the slides after answering, and
   * can still reject them, so a post waits on "pending" until it says so.
   */
  settled?: "published" | "failed" | "pending";
  error: string | null;
}

export interface EngineStats {
  plants: number;
  /** Images in the reusable library. */
  mediaAssets: number;
  /** How many generations were served from the library instead of the model. */
  mediaReuses: number;
  angles: number;
  possibleCombinations: number;
  generated: number;
  published: number;
  queued: number;
  scheduled: number;
  failed: number;
  drafts: number;
}

/* ------------------------------------------------------------------ hooks -- */

/**
 * A hook: the cover line of a carousel, "Les 6 plus belles Monstera à avoir
 * chez toi". Kept so the next ones Gemini suggests are never the same again.
 */
export type HookStatus = "idea" | "used";
/** Where a hook came from: typed, suggested, a carousel's, or a spied post's. */
export type HookSource = "manual" | "gemini" | "carousel" | "spy";

export interface Hook {
  id: string;
  text: string;
  /** The text folded - case, accents, punctuation - so near-copies collide. */
  key: string;
  status: HookStatus;
  source: HookSource;
  carouselId: string | null;
  spyPostId: string | null;
  createdAt: string;
  updatedAt: string;
  usedAt: string | null;
}

/* -------------------------------------------------------------------- spy -- */

/** Our own accounts are split in two teams, pitted against each other. */
export type Team = "stark" | "mousk";
export const TEAMS: Team[] = ["stark", "mousk"];

/** A TikTok account the spy visits every day - a competitor, or one of ours. */
export interface SpyAccount {
  /** Without the @, lowercase. */
  username: string;
  enabled: boolean;
  /** Null for a competitor; the team for one of our own accounts. */
  team: Team | null;
  /** All the likes the account ever received, as its profile shows it. */
  likesTotal: number | null;
  note: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  followers: number | null;
  addedAt: string;
  lastCheckedAt: string | null;
  lastStatus: "ok" | "empty" | "error" | null;
  lastError: string | null;
  /** Carousels seen on the last pass. */
  lastFound: number | null;
}

export type SpyPostStatus = "new" | "processed" | "dismissed";

/** A spied post: a photo carousel, or - for our own accounts only - a video. */
export type SpyMediaType = "carousel" | "video";

/** One carousel found on a watched account, with its numbers. */
export interface SpyPost {
  /** TikTok's own post id. */
  id: string;
  username: string;
  mediaType: SpyMediaType;
  url: string;
  caption: string;
  postedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  /** The slides, copied to our storage: TikTok's own links expire. */
  images: { url: string; width?: number; height?: number }[];
  status: SpyPostStatus;
  /** The carousel it was turned into, once processed. */
  carouselId: string | null;
  firstSeenAt: string;
  statsUpdatedAt: string;
  handledAt: string | null;
  /** The cover line read on its first slide, in its own language; "" when it has none. */
  hookText: string | null;
  hookLang: string | null;
  hookFormat: HookFormat | null;
  /** That hook in French, in our voice - the idea filed in the bank from it. */
  hookFr: string | null;
  /** When the first slide was read; null while it has not been. */
  hookCheckedAt: string | null;
  /**
   * A competitor's old carousel from the one-off history import: its cover and
   * numbers only. It feeds the hook tier list, never the Spy page's lists, and
   * cannot be rebuilt (its slides were not kept).
   */
  fromHistory: boolean;
  /**
   * Deleted by hand from the Spy page: its pictures are gone, it is off the
   * Spy page for good, and the spy never brings it back. Its numbers stay, for
   * the hooks read from it.
   */
  removed: boolean;
}

/** What kind of hook it is - for browsing the bank by shape. */
export type HookFormat =
  | "list"
  | "mistakes"
  | "tip"
  | "transformation"
  | "pov"
  | "question"
  | "story"
  | "other";

export const HOOK_FORMATS: HookFormat[] = [
  "list",
  "mistakes",
  "tip",
  "transformation",
  "pov",
  "question",
  "story",
  "other",
];

/** A spied hook's evidence: the post it came from and what that post did. */
export interface HookSpyStats {
  postId: string;
  username: string;
  url: string;
  postedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  images: SpyPost["images"];
  /** The hook as that creator wrote it. */
  original: string;
  lang: string | null;
  format: HookFormat | null;
  /** Median views of that account's spied posts - what "normal" is for it. */
  accountMedian: number | null;
  /** Whether the post itself was rebuilt, set aside, or is still waiting. */
  postStatus: SpyPostStatus;
  /** Imported with its history: cover only, so it cannot be rebuilt. */
  fromHistory: boolean;
}

/** A hook as the pages show it: with its evidence when it came from the spy. */
export interface HookView extends Hook {
  spy: HookSpyStats | null;
}

/** One pass of the spy script. */
export interface SpyRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  accounts: number;
  found: number;
  added: number;
  errors: { username: string; message: string }[];
  host: string | null;
}

/** A computer allowed to run the spy, through its own access code. */
export interface SpyAgent {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  /** The computer's own name, as it reported it on its last pass. */
  lastHost: string | null;
  revokedAt: string | null;
}

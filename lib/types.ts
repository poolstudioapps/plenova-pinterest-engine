/** Shared domain types for the Pinterest engine. */

import type { Locale } from "@/lib/i18n";

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
  locale: Locale;
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
  sourceId: string | null;

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

/** A connected TikTok account. Tokens live encrypted, same as Pinterest. */
export interface TikTokConnection {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  scopes: string[];
  openId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  connectedAt: string;
}

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
export interface CarouselSlide {
  kind: "hook" | "content" | "cta";
  title: string;
  subtitle: string;
  imagePrompt: string;
  mediaId: string | null;
  /** The bare photograph, which stays reusable by other carousels. */
  imageUrl: string | null;
  /** The photograph with its text burned in. This is what gets published. */
  composedUrl: string | null;
}

/** A TikTok photo carousel: ordered slides plus one caption. */
export interface CarouselRecord {
  id: string;
  locale: Locale;
  /** The theme the operator asked for, kept so it is not repeated later. */
  theme: string;
  title: string;
  description: string;
  hashtags: string[];
  slides: CarouselSlide[];
  /** Public URLs in slide order, resolved for publishing. */
  slideUrls: string[];
  /** 1-indexed, as TikTok expects. */
  coverIndex: number;

  plantSlug: string | null;
  plantName: string | null;

  status: CarouselStatus;
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  privacyLevel: string | null;
  brandContentToggle: boolean;
  brandOrganicToggle: boolean;

  publishId: string | null;
  publishedAt: string | null;
  error: string | null;

  createdAt: string;
  updatedAt: string;
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

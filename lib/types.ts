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

export interface EngineStats {
  plants: number;
  angles: number;
  possibleCombinations: number;
  generated: number;
  published: number;
  queued: number;
  scheduled: number;
  failed: number;
  drafts: number;
}

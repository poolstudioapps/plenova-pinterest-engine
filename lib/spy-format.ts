import type { SpyPost } from "@/lib/types";

/** 12 400 -> "12,4 k", the way the numbers read on TikTok itself. */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * Interactions per view: likes, comments, shares and saves over views.
 *
 * Saves count as much as likes here on purpose - on a carousel, "saved for
 * later" is the strongest sign the content was useful. Null without views,
 * rather than a misleading 0 % or infinity.
 */
export function engagementRate(post: Pick<SpyPost, "views" | "likes" | "comments" | "shares" | "saves">): number | null {
  if (!post.views) return null;
  return (post.likes + post.comments + post.shares + post.saves) / post.views;
}

export function percent(rate: number | null): string {
  if (rate === null) return "-";
  return new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 }).format(rate);
}

export type SpySort = "engagement" | "views" | "recent";

export function sortSpyPosts(posts: SpyPost[], sort: SpySort): SpyPost[] {
  const when = (p: SpyPost) => p.postedAt ?? p.firstSeenAt;
  return [...posts].sort((a, b) => {
    if (sort === "views") return b.views - a.views;
    if (sort === "recent") return when(b).localeCompare(when(a));
    // A post seen by a handful of people can show any rate; it ranks after
    // the ones whose rate means something.
    const reach = Number(b.views >= MEANINGFUL_VIEWS) - Number(a.views >= MEANINGFUL_VIEWS);
    return reach || (engagementRate(b) ?? -1) - (engagementRate(a) ?? -1) || b.views - a.views;
  });
}

/** Below this many views, an engagement rate says little. */
export const MEANINGFUL_VIEWS = 500;

/**
 * Best engagement first - among posts seen by enough people for the rate to
 * mean something; the rest follow.
 */
export function compareEngagement(
  a: Pick<SpyPost, "views" | "likes" | "comments" | "shares" | "saves"> | null,
  b: Pick<SpyPost, "views" | "likes" | "comments" | "shares" | "saves"> | null,
): number {
  const reach = Number((b?.views ?? 0) >= MEANINGFUL_VIEWS) - Number((a?.views ?? 0) >= MEANINGFUL_VIEWS);
  return reach || (b ? (engagementRate(b) ?? -1) : -1) - (a ? (engagementRate(a) ?? -1) : -1);
}

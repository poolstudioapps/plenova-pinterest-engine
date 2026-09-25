import type { SpyAccount, SpyPost, Team } from "@/lib/types";

/** The two teams, as the versus page draws them. */
export const TEAM_META: Record<Team, { name: string; image: string; color: string; glow: string }> = {
  stark: { name: "Mr Stark", image: "/versus/stark.webp", color: "#e3262e", glow: "rgba(255, 60, 60, 0.55)" },
  mousk: { name: "Mr Mousk", image: "/versus/mousk.webp", color: "#2f55e4", glow: "rgba(70, 110, 255, 0.55)" },
};

export type Period = "7" | "30" | "all";

export interface Snapshot {
  username: string;
  day: string;
  followers: number | null;
  likesTotal: number | null;
}

export interface Totals {
  accounts: number;
  /** Now, from the profiles; null while no profile has been read. */
  followers: number | null;
  /** Over the period, from the daily snapshots; null until there are two days of them. */
  followersGained: number | null;
  /** All-time likes, from the profiles; null while no profile has been read. */
  likesTotal: number | null;
  /** Posts published in the period, and what they did. */
  posts: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  avgViews: number | null;
  engagement: number | null;
}

function since(period: Period): number {
  return period === "all" ? 0 : Date.now() - Number(period) * 86400_000;
}

export function postsIn(posts: SpyPost[], period: Period): SpyPost[] {
  const from = since(period);
  return posts.filter((p) => Date.parse(p.postedAt ?? p.firstSeenAt) >= from);
}

/**
 * Followers won over the period, between two daily snapshots: the latest,
 * and the one at the start of the period - the day just before it if the spy
 * ran then, otherwise the first day inside it. One day of history tells
 * nothing yet.
 */
function gained(username: string, snapshots: Snapshot[], period: Period): number | null {
  const own = snapshots.filter((s) => s.username === username && s.followers !== null);
  const latest = own.at(-1);
  if (!latest) return null;
  const from = since(period);
  let base = own[0];
  if (period !== "all") {
    const before = own.filter((s) => Date.parse(s.day) <= from).at(-1);
    const inside = own.find((s) => Date.parse(s.day) >= from);
    const near = before !== undefined && from - Date.parse(before.day) <= 2 * 86400_000;
    base = (near ? before : (inside ?? before)) ?? own[0];
  }
  if (!base || base === latest) return null;
  return (latest.followers ?? 0) - (base.followers ?? 0);
}

/** A sum over accounts, or null when none of them has the number yet. */
function sumKnown(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length > 0 ? known.reduce((n, v) => n + v, 0) : null;
}

export function totalsFor(
  accounts: SpyAccount[],
  posts: SpyPost[],
  snapshots: Snapshot[],
  period: Period,
): Totals {
  const names = new Set(accounts.map((a) => a.username));
  const inPeriod = postsIn(posts, period).filter((p) => names.has(p.username));
  const sum = (key: "views" | "likes" | "comments" | "shares" | "saves") =>
    inPeriod.reduce((n, p) => n + p[key], 0);
  const views = sum("views");
  const interactions = sum("likes") + sum("comments") + sum("shares") + sum("saves");
  return {
    accounts: accounts.length,
    followers: sumKnown(accounts.map((a) => a.followers)),
    followersGained: sumKnown(accounts.map((a) => gained(a.username, snapshots, period))),
    likesTotal: sumKnown(accounts.map((a) => a.likesTotal)),
    posts: inPeriod.length,
    views,
    likes: sum("likes"),
    comments: sum("comments"),
    shares: sum("shares"),
    saves: sum("saves"),
    avgViews: inPeriod.length > 0 ? views / inPeriod.length : null,
    engagement: views > 0 ? interactions / views : null,
  };
}

/** The metrics the two teams fight over, in the order they are shown. */
export const BATTLE: { key: keyof Totals; label: string; format: "number" | "percent" | "delta" }[] = [
  { key: "views", label: "Vues", format: "number" },
  { key: "followers", label: "Abonnés", format: "number" },
  { key: "followersGained", label: "Abonnés gagnés", format: "delta" },
  { key: "likesTotal", label: "Likes (total profil)", format: "number" },
  { key: "saves", label: "Enregistrements des posts", format: "number" },
  { key: "likes", label: "Likes des posts de la période", format: "number" },
  { key: "comments", label: "Commentaires", format: "number" },
  { key: "shares", label: "Partages", format: "number" },
  { key: "posts", label: "Posts publiés", format: "number" },
  { key: "avgViews", label: "Vues moyennes par post", format: "number" },
  { key: "engagement", label: "Engagement", format: "percent" },
];

/** Metrics won by each side - a tie scores for nobody, an unknown is skipped. */
export function score(a: Totals, b: Totals): { a: number; b: number } {
  let sa = 0;
  let sb = 0;
  for (const m of BATTLE) {
    const va = a[m.key];
    const vb = b[m.key];
    if (typeof va !== "number" || typeof vb !== "number" || va === vb) continue;
    if (va > vb) sa += 1;
    else sb += 1;
  }
  return { a: sa, b: sb };
}

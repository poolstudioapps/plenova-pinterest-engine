import type { HookSpyStats, HookView } from "@/lib/types";

/**
 * The tier list: spied hooks ranked by the views of the carousel they opened.
 *
 * Tiers are shares of the ranking rather than fixed view counts - the watched
 * accounts range from a few hundred followers to tens of thousands, and a
 * fixed "100k = S" would leave most tiers empty. S is the top tenth, D the
 * bottom sixth, whatever the numbers are this week.
 */
export type Tier = "S" | "A" | "B" | "C" | "D";
export const TIERS: Tier[] = ["S", "A", "B", "C", "D"];

/** Upper bound of each tier, as a share of the ranking. */
const CUTS: [Tier, number][] = [
  ["S", 0.1],
  ["A", 0.3],
  ["B", 0.6],
  ["C", 0.85],
  ["D", 1],
];

/** One hue per tier, mixed into the theme so it reads in light and dark. */
export const TIER_HUE: Record<Tier, string> = {
  S: "#d99a00",
  A: "#2f9e62",
  B: "#3a7fc1",
  C: "#8a67c7",
  D: "#8a8f87",
};

export function tierStyle(tier: Tier): { background: string; color: string } {
  const hue = TIER_HUE[tier];
  return {
    background: `color-mix(in oklab, ${hue} 20%, var(--color-surface))`,
    color: `color-mix(in oklab, ${hue} 72%, var(--color-ink))`,
  };
}

/** Tier of every spied hook, by id. Hooks without evidence have none. */
export function assignTiers(hooks: HookView[]): Map<string, Tier> {
  const ranked = hooks
    .filter((h): h is HookView & { spy: HookSpyStats } => h.spy !== null)
    .sort((a, b) => b.spy.views - a.spy.views);
  const out = new Map<string, Tier>();
  let above = 0;
  ranked.forEach((hook, i) => {
    // Share of the ranking strictly above this hook: the best one is at 0, so
    // a bank of one hook is S, and equal views always land in the same tier.
    if (i > 0 && ranked[i - 1]!.spy.views > hook.spy.views) above = i;
    const share = above / ranked.length;
    out.set(hook.id, CUTS.find(([, cut]) => share < cut)?.[0] ?? "D");
  });
  return out;
}

/** How the post did against its own account: 3 = three times its usual views. */
export function outperformance(spy: HookSpyStats | null): number | null {
  if (!spy || !spy.accountMedian) return null;
  return spy.views / spy.accountMedian;
}

export function multiplier(value: number | null): string {
  if (value === null) return "-";
  return `×${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)}`;
}

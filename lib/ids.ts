import { createHash } from "node:crypto";

/**
 * Duplicate prevention (spec §17).
 *
 * `dedupeKey` is the identity of a content slot: locale + plant + cultivar +
 * angle + style + variation.
 *
 * The cultivar matters: a Monstera 'variegata' care guide is a legitimately
 * different Pin from the plain species one - different image, different
 * audience - not a duplicate of it. Two Pins sharing a dedupe key are the same slot and must not both
 * be generated. It is deterministic, so the check works without a database.
 */
export function dedupeKey(input: {
  plantSlug: string;
  angleSlug: string;
  visualStyle: string;
  variation: number;
  locale: string;
  /** Slugified cultivar, or null for the plain species. */
  varietySlug: string | null;
}): string {
  // Locale is part of the slot identity: the same plant+angle in French and in
  // English are two legitimate Pins, not a duplicate.
  const raw = [
    input.locale,
    input.plantSlug,
    input.varietySlug ?? "",
    input.angleSlug,
    input.visualStyle,
    String(input.variation),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

/** Short, sortable, collision-resistant record id. */
export function pinId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `pin_${time}${rand}`;
}

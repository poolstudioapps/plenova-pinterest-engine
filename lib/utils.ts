/** Shared helpers usable from both server and client components. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Pinterest hard limits, enforced before we ever call the API (spec §15). */
export const PINTEREST_LIMITS = {
  titleMax: 100,
  descriptionMax: 800,
  altTextMax: 500,
} as const;

/**
 * Shortens text to `max` characters INCLUDING the ellipsis.
 *
 * The ellipsis has to be budgeted for, not appended afterwards: this enforces
 * Pinterest's and TikTok's hard limits, and a result one character over is a
 * rejected publish rather than a cosmetic issue.
 */
export function truncate(input: string, max: number): string {
  const trimmed = input.trim();
  if (trimmed.length <= max) return trimmed;

  const ellipsis = "...";
  const room = Math.max(1, max - ellipsis.length);
  const slice = trimmed.slice(0, room);

  // Prefer a word boundary, but only when it does not gut the text.
  const lastSpace = slice.lastIndexOf(" ");
  const body = lastSpace > room * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${body.trimEnd()}${ellipsis}`;
}

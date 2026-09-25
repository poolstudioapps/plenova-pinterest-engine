"use client";

import { tierStyle, type Tier } from "@/lib/hook-tiers";
import type { TranslationKey } from "@/lib/i18n";
import type { HookFormat, HookSource } from "@/lib/types";
import { cn } from "@/lib/utils";

export const FORMAT_LABELS: Record<HookFormat, TranslationKey> = {
  list: "hooks.formatList",
  mistakes: "hooks.formatMistakes",
  tip: "hooks.formatTip",
  transformation: "hooks.formatTransformation",
  pov: "hooks.formatPov",
  question: "hooks.formatQuestion",
  story: "hooks.formatStory",
  other: "hooks.formatOther",
};

export const SOURCE_LABELS: Record<HookSource, TranslationKey> = {
  manual: "hooks.sourceManual",
  gemini: "hooks.sourceGemini",
  carousel: "hooks.sourceCarousel",
  spy: "hooks.sourceSpy",
};

/** The tier letter, in its colour. */
export function TierBadge({ tier, large = false }: { tier: Tier; large?: boolean }) {
  return (
    <span
      style={tierStyle(tier)}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-[8px] font-bold tabular-nums",
        large ? "size-11 text-[20px]" : "size-6 text-[12.5px]",
      )}
    >
      {tier}
    </span>
  );
}

/** The cover of the carousel a hook opened - the hook as it was seen. */
export function HookThumb({
  src,
  className,
  onClick,
  label,
}: {
  src: string | undefined;
  className?: string;
  onClick?: () => void;
  label?: string;
}) {
  const body = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="size-full object-cover" />
  ) : null;
  const classes = cn(
    "block shrink-0 overflow-hidden rounded-[9px] border border-[var(--color-line)] bg-[var(--color-surface-muted)]",
    className,
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={label} className={cn(classes, "transition-transform hover:scale-[1.03]")}>
      {body}
    </button>
  ) : (
    <span className={classes}>{body}</span>
  );
}

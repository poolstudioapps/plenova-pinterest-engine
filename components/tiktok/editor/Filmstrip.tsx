"use client";

import { memo } from "react";
import { SlidePreview } from "@/components/tiktok/SlidePreview";
import { translator } from "@/lib/i18n";
import type { SlideOverlay } from "@/lib/overlay";
import { cn } from "@/lib/utils";
import type { SlideWords } from "./state";

export interface FilmstripItem {
  src: string | null;
  overlay: SlideOverlay;
  words: SlideWords;
  /** Changed since the last save. */
  dirty: boolean;
  /** No title in the language on screen. */
  missing: boolean;
  mention: boolean;
}

/**
 * Every slide of the carousel, drawn live from the draft, to jump between.
 *
 * Each thumbnail is memoised on its own slide: a slide that did not change
 * keeps the same objects, so dragging a block on one slide redraws one
 * thumbnail rather than all of them.
 */
export function Filmstrip({
  items,
  active,
  onGo,
  label,
}: {
  items: FilmstripItem[];
  active: number;
  onGo: (index: number) => void;
  label: (index: number) => string;
}) {
  const t = translator();
  return (
    <nav
      aria-label={t("editor.slidesNav")}
      className="flex gap-2.5 overflow-x-auto p-3 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto"
    >
      {items.map((item, index) => (
        <Thumb
          key={index}
          index={index}
          active={index === active}
          onGo={onGo}
          label={label(index)}
          {...item}
        />
      ))}
    </nav>
  );
}

const Thumb = memo(function Thumb({
  index,
  active,
  onGo,
  label,
  src,
  overlay,
  words,
  dirty,
  missing,
  mention,
}: FilmstripItem & {
  index: number;
  active: boolean;
  onGo: (index: number) => void;
  label: string;
}) {
  const t = translator();
  return (
    <button
      type="button"
      onClick={() => onGo(index)}
      aria-current={active ? "true" : undefined}
      aria-label={label}
      title={label}
      className={cn(
        "group relative w-[78px] shrink-0 rounded-[11px] p-[3px] text-left transition-colors lg:w-full",
        active
          ? "bg-[var(--color-accent)]"
          : "bg-transparent hover:bg-[var(--color-line-strong)]",
      )}
    >
      {src ? (
        <SlidePreview
          className="w-full rounded-[8px]"
          src={src}
          copy={words}
          overlay={overlay}
        />
      ) : (
        <div className="aspect-[4/5] w-full rounded-[8px] bg-[var(--color-line)]" />
      )}
      <span
        className={cn(
          "absolute top-1.5 left-1.5 grid min-w-5 place-items-center rounded-full px-1 text-[10.5px] font-semibold",
          active
            ? "bg-white text-[var(--color-accent-ink)]"
            : "bg-black/65 text-white",
        )}
      >
        {index + 1}
      </span>
      <span className="absolute top-1.5 right-1.5 flex gap-1">
        {mention ? (
          <span
            title={t("editor.thumbMention")}
            className="grid size-4 place-items-center rounded-full bg-white/90 text-[9px] text-[var(--color-accent)]"
          >
            ◆
          </span>
        ) : null}
        {missing ? (
          <span
            title={t("editor.thumbMissing")}
            className="grid size-4 place-items-center rounded-full bg-[var(--color-danger)] text-[10px] font-bold text-white"
          >
            !
          </span>
        ) : null}
      </span>
      {dirty ? (
        <span
          title={t("editor.thumbDirtyHint")}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-warn)] px-1.5 py-px text-[9.5px] font-semibold text-white shadow"
        >
          {t("editor.thumbDirty")}
        </span>
      ) : null}
    </button>
  );
});

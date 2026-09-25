"use client";

import { memo } from "react";
import { SlidePreview } from "@/components/tiktok/SlidePreview";
import { SortableGrid } from "@/components/ui";
import { translator } from "@/lib/i18n";
import type { SlideOverlay } from "@/lib/overlay";
import { cn } from "@/lib/utils";
import * as Icon from "./icons";
import type { SlideWords } from "./state";

export interface FilmstripItem {
  uid: string;
  src: string | null;
  overlay: SlideOverlay;
  words: SlideWords;
  /** New, or changed since the last save. */
  dirty: boolean;
  /** Words written in another language, not yet in the one on screen. */
  missing: boolean;
  mention: boolean;
}

/**
 * Every slide of the carousel, drawn live from the draft: click to open one,
 * drag to move it, "+" to add one.
 *
 * Each thumbnail is memoised on its own slide: a slide that did not change
 * keeps the same objects, so dragging a block on one slide redraws one
 * thumbnail rather than all of them.
 */
export function Filmstrip({
  items,
  active,
  disabled,
  onGo,
  onReorder,
  onAdd,
  canAdd,
  label,
}: {
  items: FilmstripItem[];
  active: number;
  disabled?: boolean;
  onGo: (index: number) => void;
  onReorder: (uids: string[]) => void;
  onAdd: () => void;
  canAdd: boolean;
  label: (index: number) => string;
}) {
  const t = translator();
  return (
    <nav
      aria-label={t("editor.slidesNav")}
      data-editor-filmstrip
      className="flex gap-2.5 overflow-x-auto p-3 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto"
      onKeyDown={(e) => {
        // The sortable items own the arrow keys (they move the slide);
        // Enter and Space open it.
        if (e.key !== "Enter" && e.key !== " ") return;
        const host = (e.target as HTMLElement).querySelector?.<HTMLElement>("[data-slide-index]");
        if (!host) return;
        e.preventDefault();
        onGo(Number(host.dataset.slideIndex));
      }}
    >
      <SortableGrid
        items={items}
        getId={(item) => item.uid}
        onReorder={onReorder}
        disabled={disabled}
        className="flex gap-2.5 lg:flex-col"
        itemLabel={(_, index) => label(index)}
        renderItem={(item, { index }) => (
          <Thumb
            index={index}
            active={index === active}
            onGo={onGo}
            src={item.src}
            overlay={item.overlay}
            words={item.words}
            dirty={item.dirty}
            missing={item.missing}
            mention={item.mention}
          />
        )}
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd || disabled}
        title={canAdd ? t("editor.addSlide") : t("editor.addSlideFull")}
        className="flex aspect-[4/5] w-[78px] shrink-0 flex-col items-center justify-center gap-1 rounded-[11px] border-2 border-dashed border-[var(--color-line-strong)] text-[11px] font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 lg:w-full"
      >
        <Icon.Plus />
        {t("editor.addSlideShort")}
      </button>
    </nav>
  );
}

const Thumb = memo(function Thumb({
  index,
  active,
  onGo,
  src,
  overlay,
  words,
  dirty,
  missing,
  mention,
}: Omit<FilmstripItem, "uid"> & {
  index: number;
  active: boolean;
  onGo: (index: number) => void;
}) {
  const t = translator();
  return (
    <div
      data-slide-index={index}
      onClick={() => onGo(index)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative w-[78px] rounded-[11px] p-[3px] transition-colors lg:w-full",
        active ? "bg-[var(--color-accent)]" : "bg-transparent hover:bg-[var(--color-line-strong)]",
      )}
    >
      {src ? (
        <SlidePreview
          className="pointer-events-none w-full rounded-[8px]"
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
          active ? "bg-white text-[var(--color-accent-ink)]" : "bg-black/65 text-white",
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
            className="grid size-4 place-items-center rounded-full bg-[var(--color-warn)] text-[10px] font-bold text-white"
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
    </div>
  );
});

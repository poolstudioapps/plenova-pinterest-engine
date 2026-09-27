"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  ChatCircle,
  Eye,
  Heart,
  Quotes,
  ShareFat,
  TrendUp,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { Badge, Card } from "@/components/ui";
import { translator } from "@/lib/i18n";
import { compactNumber, engagementRate, percent } from "@/lib/spy-format";
import type { SpyAccount, SpyPost } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

/**
 * One spied carousel: every slide, what it did, and what to do with it.
 *
 * The slides are the point - the hook is on the first one, the structure is
 * the rest - so they are shown whole, in a strip, and open large on a click.
 */
export function SpyPostCard({
  post,
  account,
  actions,
  compact = false,
}: {
  post: SpyPost;
  account: SpyAccount | undefined;
  actions: ReactNode;
  compact?: boolean;
}) {
  const t = translator();
  const [viewing, setViewing] = useState<number | null>(null);
  const rate = engagementRate(post);

  /*
   * The counters as TikTok shows them: a glyph and a number, in a row the eye
   * runs along. The word is still there for a screen reader and on hover.
   */
  const stats: { label: string; value: string; icon: Icon }[] = [
    { label: t("spy.views"), value: compactNumber(post.views), icon: Eye },
    { label: t("spy.likes"), value: compactNumber(post.likes), icon: Heart },
    { label: t("spy.comments"), value: compactNumber(post.comments), icon: ChatCircle },
    { label: t("spy.shares"), value: compactNumber(post.shares), icon: ShareFat },
    { label: t("spy.saves"), value: compactNumber(post.saves), icon: BookmarkSimple },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4">
        {account?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.avatarUrl}
            alt=""
            className="size-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--color-edge)]"
          />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-surface-muted)] text-[13px] font-semibold text-[var(--color-ink-soft)] ring-1 ring-[var(--color-edge)]">
            {post.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <a
            href={`https://www.tiktok.com/@${post.username}`}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-[14px] font-semibold hover:underline"
          >
            @{post.username}
          </a>
          <p className="text-[12px] text-[var(--color-ink-faint)]">
            {t("spy.posted", { when: relativeTime(post.postedAt ?? post.firstSeenAt) })}
            {" · "}
            {t("spy.slides", { n: post.images.length })}
          </p>
        </div>
        {post.status === "processed" ? (
          <Badge className="bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]">
            {t("spy.badgeProcessed")}
          </Badge>
        ) : post.status === "dismissed" ? (
          <Badge>{t("spy.badgeDismissed")}</Badge>
        ) : null}
      </div>

      {/*
        The strip snaps slide by slide, fades out at its edge where more
        slides wait, and keeps a thin scrollbar: a mouse without a sideways
        wheel still needs something to drag.
      */}
      <div
        className={cn(
          "flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pt-3 pb-2 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]",
          "[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]",
          compact && "pb-1",
        )}
      >
        {post.images.map((image, i) => (
          <button
            key={image.url}
            type="button"
            onClick={() => setViewing(i)}
            className="shrink-0 snap-start overflow-hidden rounded-[10px] bg-[var(--color-surface-muted)] ring-1 ring-[var(--color-edge)] transition-[scale,box-shadow] duration-200 ease-out hover:shadow-[var(--shadow-raised)] active:scale-[0.97] pointer-fine:hover:scale-[1.03]"
            aria-label={t("spy.slideAlt", { n: i + 1 })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt=""
              loading="lazy"
              className={cn("w-auto object-cover", compact ? "h-[120px]" : "h-[170px]")}
              style={{ aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : "9 / 16" }}
            />
          </button>
        ))}
      </div>

      {/* The hook is what gets reused: set as a quote, not as a caption. */}
      {post.hookText ? (
        <div className="mx-4 mt-2 flex gap-2.5 rounded-[12px] bg-[var(--color-canvas)] px-3.5 py-2.5 ring-1 ring-[var(--color-edge)]">
          <Quotes aria-hidden size={16} weight="fill" className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
          <p className="text-[13.5px] leading-snug font-semibold text-[var(--color-ink)]">
            <span className="sr-only">{t("spy.hook")} : </span>
            {post.hookText}
          </p>
        </div>
      ) : null}

      {post.caption && !compact ? (
        <p className="line-clamp-2 px-4 pt-2.5 text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
          {post.caption}
        </p>
      ) : null}

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3">
        {stats.map((s) => {
          const Glyph = s.icon;
          return (
            <div key={s.label} title={s.label} className="flex items-center gap-1.5">
              <dt>
                <Glyph aria-hidden size={16} className="text-[var(--color-ink-faint)]" />
                <span className="sr-only">{s.label}</span>
              </dt>
              <dd className="figures text-[13.5px] font-semibold">{s.value}</dd>
            </div>
          );
        })}
        <div
          title={t("spy.engagementHint")}
          className="ml-auto flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[var(--color-accent-ink)]"
        >
          <dt>
            <TrendUp aria-hidden size={14} weight="bold" />
            <span className="sr-only">{t("spy.engagement")}</span>
          </dt>
          <dd className="figures text-[12.5px] font-semibold">{percent(rate)}</dd>
        </div>
      </dl>

      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] bg-[var(--color-canvas)]/50 px-4 py-3">
        {actions}
      </div>

      {viewing !== null ? (
        <SlideViewer
          images={post.images.map((i) => i.url)}
          start={viewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </Card>
  );
}

/** The slides large, one at a time, with the arrows and Escape. */
export function SlideViewer({
  images,
  start,
  onClose,
}: {
  images: string[];
  start: number;
  onClose: () => void;
}) {
  const t = translator();
  const [at, setAt] = useState(start);

  useEffect(() => {
    // Captured first and kept: the viewer is the top layer, so a dialog under
    // it must not also close on this Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === "ArrowRight") setAt((i) => Math.min(images.length - 1, i + 1));
      if (e.key === "ArrowLeft") setAt((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [images.length, onClose]);

  const arrow =
    "grid size-11 shrink-0 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/15 backdrop-blur-md transition-[background-color,scale] duration-150 hover:bg-white/25 active:scale-[0.94] disabled:pointer-events-none disabled:opacity-25";

  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[70] flex items-center justify-center gap-3 bg-[rgb(6_12_5/0.88)] p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/15 transition-[background-color,scale] hover:bg-white/25 active:scale-[0.94]"
      >
        <X aria-hidden size={18} weight="bold" />
      </button>
      <button type="button" className={arrow} onClick={() => setAt((i) => i - 1)} disabled={at === 0} aria-label="Slide précédente">
        <CaretLeft aria-hidden size={20} weight="bold" />
      </button>
      <figure className="dialog-in flex max-h-full flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[at]}
          alt=""
          className="max-h-[82dvh] max-w-[78vw] rounded-[14px] object-contain shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)]"
        />
        <figcaption className="figures rounded-full bg-white/10 px-3 py-1 text-[12.5px] text-white/85">
          {at + 1} / {images.length}
        </figcaption>
      </figure>
      <button
        type="button"
        className={arrow}
        onClick={() => setAt((i) => i + 1)}
        disabled={at >= images.length - 1}
        aria-label="Slide suivante"
      >
        <CaretRight aria-hidden size={20} weight="bold" />
      </button>
    </div>,
    document.body,
  );
}

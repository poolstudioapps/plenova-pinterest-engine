"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

  const stats: { label: string; value: string; strong?: boolean; title?: string }[] = [
    { label: t("spy.views"), value: compactNumber(post.views) },
    { label: t("spy.likes"), value: compactNumber(post.likes) },
    { label: t("spy.comments"), value: compactNumber(post.comments) },
    { label: t("spy.shares"), value: compactNumber(post.shares) },
    { label: t("spy.saves"), value: compactNumber(post.saves) },
    { label: t("spy.engagement"), value: percent(rate), strong: true, title: t("spy.engagementHint") },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4">
        {account?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatarUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-surface-muted)] text-[13px] font-semibold text-[var(--color-ink-soft)]">
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

      <div className={cn("flex gap-2 overflow-x-auto px-4 pt-3 pb-1", compact && "pb-0")}>
        {post.images.map((image, i) => (
          <button
            key={image.url}
            type="button"
            onClick={() => setViewing(i)}
            className="shrink-0 overflow-hidden rounded-[9px] border border-[var(--color-line)] bg-[var(--color-surface-muted)] transition-transform hover:scale-[1.02]"
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

      {post.caption && !compact ? (
        <p className="line-clamp-2 px-4 pt-2 text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
          {post.caption}
        </p>
      ) : null}

      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 px-4 pt-3">
        {stats.map((s) => (
          <div key={s.label} title={s.title}>
            <dt className="truncate text-[11px] text-[var(--color-ink-faint)]">{s.label}</dt>
            <dd
              className={cn(
                "text-[14px] font-semibold tabular-nums",
                s.strong && "text-[var(--color-accent-ink)]",
              )}
            >
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-4 py-3">
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
function SlideViewer({
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setAt((i) => Math.min(images.length - 1, i + 1));
      if (e.key === "ArrowLeft") setAt((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  const arrow =
    "grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-[22px] text-white transition-colors hover:bg-white/30 disabled:opacity-30";

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center gap-3 bg-black/85 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <button type="button" className={arrow} onClick={() => setAt((i) => i - 1)} disabled={at === 0} aria-label="←">
        ‹
      </button>
      <figure className="flex max-h-full flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[at]} alt="" className="max-h-[82vh] max-w-[80vw] rounded-[12px] object-contain" />
        <figcaption className="text-[13px] text-white/80 tabular-nums">
          {t("spy.slideAlt", { n: at + 1 })} / {images.length}
        </figcaption>
      </figure>
      <button
        type="button"
        className={arrow}
        onClick={() => setAt((i) => i + 1)}
        disabled={at >= images.length - 1}
        aria-label="→"
      >
        ›
      </button>
    </div>,
    document.body,
  );
}

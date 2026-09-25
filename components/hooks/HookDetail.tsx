"use client";

import { useState } from "react";
import { Badge, Button, ButtonLink, Dialog } from "@/components/ui";
import { FORMAT_LABELS, SOURCE_LABELS, TierBadge } from "@/components/hooks/parts";
import { ProcessDialog } from "@/components/spy/ProcessDialog";
import { SlideViewer } from "@/components/spy/SpyPostCard";
import { multiplier, outperformance, type Tier } from "@/lib/hook-tiers";
import { translator, type ContentLocale } from "@/lib/i18n";
import { compactNumber, engagementRate, percent } from "@/lib/spy-format";
import type { HookView } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

/**
 * Everything about one hook: the carousel it opened, slide by slide, what
 * that carousel did, the hook as its creator wrote it and as we would say it -
 * and the two ways to use it.
 */
export function HookDetail({
  hook,
  tier,
  defaultLanguages,
  hasPexels,
  onClose,
  onUse,
  onToggleStatus,
  onRebuilt,
}: {
  hook: HookView;
  tier: Tier | undefined;
  defaultLanguages: ContentLocale[];
  hasPexels: boolean;
  onClose: () => void;
  onUse: (text: string) => void;
  onToggleStatus: (hook: HookView) => void;
  onRebuilt: (hook: HookView) => void;
}) {
  const t = translator();
  const [viewing, setViewing] = useState<number | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const spy = hook.spy;
  const perf = outperformance(spy);

  const stats = spy
    ? [
        { label: t("spy.views"), value: compactNumber(spy.views) },
        { label: t("spy.likes"), value: compactNumber(spy.likes) },
        { label: t("spy.comments"), value: compactNumber(spy.comments) },
        { label: t("spy.shares"), value: compactNumber(spy.shares) },
        { label: t("spy.saves"), value: compactNumber(spy.saves) },
        { label: t("spy.engagement"), value: percent(engagementRate(spy)) },
      ]
    : [];

  return (
    <>
      <Dialog
        title={t("hooks.detailTitle")}
        onClose={onClose}
        className="max-w-3xl"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => onToggleStatus(hook)}>
              {hook.status === "idea" ? t("hooks.markUsed") : t("hooks.markIdea")}
            </Button>
            {spy && spy.postStatus === "new" && !spy.fromHistory ? (
              <Button size="sm" onClick={() => setRebuilding(true)}>
                {t("hooks.rebuild")}
              </Button>
            ) : null}
            <Button size="sm" variant="primary" onClick={() => onUse(hook.text)}>
              {t("hooks.useThis")}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            {tier ? <TierBadge tier={tier} large /> : null}
            <div className="min-w-0 flex-1">
              <p className="text-[18px] leading-snug font-semibold">{hook.text}</p>
              {spy?.original ? (
                <p className="mt-1.5 text-[13px] text-[var(--color-ink-soft)]">
                  <span className="mr-1.5 text-[11px] font-semibold tracking-wide text-[var(--color-ink-faint)] uppercase">
                    {t("hooks.original")}
                    {spy.lang ? ` · ${spy.lang}` : ""}
                  </span>
                  « {spy.original} »
                </p>
              ) : null}
              <p className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{hook.status === "idea" ? t("hooks.statusIdea") : t("hooks.statusUsed")}</Badge>
                <Badge>{t(SOURCE_LABELS[hook.source])}</Badge>
                {spy?.format ? <Badge>{t(FORMAT_LABELS[spy.format])}</Badge> : null}
              </p>
            </div>
          </div>

          {spy ? (
            <>
              <div>
                <p className="mb-2 text-[12.5px] font-semibold text-[var(--color-ink-soft)]">{t("hooks.slides")}</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {spy.images.map((image, i) => (
                    <button
                      key={image.url}
                      type="button"
                      onClick={() => setViewing(i)}
                      aria-label={t("spy.slideAlt", { n: i + 1 })}
                      className="shrink-0 overflow-hidden rounded-[10px] border border-[var(--color-line)] transition-transform hover:scale-[1.02]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt=""
                        loading="lazy"
                        className="h-[220px] w-auto object-cover"
                        style={{ aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : "9 / 16" }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[12.5px] font-semibold text-[var(--color-ink-soft)]">{t("hooks.stats")}</p>
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <dt className="truncate text-[11px] text-[var(--color-ink-faint)]">{s.label}</dt>
                      <dd className="text-[15px] font-semibold tabular-nums">{s.value}</dd>
                    </div>
                  ))}
                </dl>
                {perf !== null ? (
                  <p className="mt-2 text-[12.5px] text-[var(--color-ink-soft)]">
                    <span className="font-semibold text-[var(--color-accent-ink)]">{multiplier(perf)}</span>{" "}
                    {t("hooks.perf")}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] pt-3 text-[12.5px]">
                <span className="text-[var(--color-ink-faint)]">
                  {t("hooks.postedBy", {
                    name: spy.username,
                    when: relativeTime(spy.postedAt),
                  })}
                  {spy.postStatus === "processed"
                    ? ` · ${t("hooks.postProcessed")}`
                    : spy.postStatus === "dismissed"
                      ? ` · ${t("hooks.postDismissed")}`
                      : ""}
                </span>
                <a href={spy.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--color-accent)] hover:underline">
                  {t("hooks.viewPost")}
                </a>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-[var(--color-ink-faint)]">
              {hook.usedAt
                ? t("hooks.usedIn", { when: relativeTime(hook.usedAt) })
                : t("hooks.addedWhen", { when: relativeTime(hook.createdAt) })}
            </p>
          )}

          {hook.carouselId ? (
            <ButtonLink href="/carousels" size="sm" variant="ghost">
              {t("spy.openCarousel")}
            </ButtonLink>
          ) : null}
        </div>
      </Dialog>

      {viewing !== null && spy ? (
        <SlideViewer images={spy.images.map((i) => i.url)} start={viewing} onClose={() => setViewing(null)} />
      ) : null}

      {rebuilding && spy ? (
        <ProcessDialog
          post={{ id: spy.postId }}
          defaultLanguages={defaultLanguages}
          hasPexels={hasPexels}
          onClose={() => setRebuilding(false)}
          onStarted={() => onRebuilt(hook)}
        />
      ) : null}
    </>
  );
}

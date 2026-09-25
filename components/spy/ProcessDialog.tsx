"use client";

import { useState } from "react";
import { Button, ButtonLink, Dialog, Field, Notice } from "@/components/ui";
import { WritingOptions } from "@/components/tiktok/WritingOptions";
import { translator, type ContentLocale } from "@/lib/i18n";
import type { OverlayStyle } from "@/lib/overlay";
import type { CarouselRecord, SpyPost } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ImageMode = "clean" | "pexels";

/**
 * Where a rebuilt slide's picture comes from - asked wherever a carousel is
 * rebuilt, from the spy or from screenshots.
 */
export function ImageModeChoice({
  value,
  onChange,
  hasPexels,
}: {
  value: ImageMode;
  onChange: (mode: ImageMode) => void;
  hasPexels: boolean;
}) {
  const t = translator();
  const options: { mode: ImageMode; label: string; hint: string; disabled?: boolean }[] = [
    { mode: "clean", label: t("spy.imageClean"), hint: t("spy.imageCleanHint") },
    {
      mode: "pexels",
      label: t("spy.imagePexels"),
      hint: hasPexels ? t("spy.imagePexelsHint") : t("spy.noPexels"),
      disabled: !hasPexels,
    },
  ];
  return (
    <Field label={t("spy.imageMode")}>
      <div role="radiogroup" aria-label={t("spy.imageMode")} className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={value === o.mode}
            disabled={o.disabled}
            onClick={() => onChange(o.mode)}
            className={cn(
              "rounded-[12px] border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
              value === o.mode
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-line-strong)] hover:border-[var(--color-accent)]",
            )}
          >
            <span className="block text-[13.5px] font-semibold">{o.label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-[var(--color-ink-soft)]">
              {o.hint}
            </span>
          </button>
        ))}
      </div>
    </Field>
  );
}

/** Starts the rebuild of one spied carousel, with the choices it needs. */
export function ProcessDialog({
  post,
  defaultLanguages,
  hasPexels,
  onClose,
  onStarted,
}: {
  post: SpyPost;
  defaultLanguages: ContentLocale[];
  hasPexels: boolean;
  onClose: () => void;
  onStarted: (post: SpyPost, carousel: CarouselRecord) => void;
}) {
  const t = translator();
  const [languages, setLanguages] = useState<ContentLocale[]>(defaultLanguages);
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>("stroke");
  const [imageMode, setImageMode] = useState<ImageMode>("clean");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<CarouselRecord | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/spy/posts/${encodeURIComponent(post.id)}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages, imageMode, overlayStyle }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        carousel?: CarouselRecord;
        error?: { message?: string };
      };
      if (!res.ok || !data.carousel) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      setStarted(data.carousel);
      onStarted(post, data.carousel);
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t("spy.processTitle")}
      onClose={onClose}
      footer={
        started ? (
          <>
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t("carousels.hooksClose")}
            </Button>
            <ButtonLink href="/carousels" variant="primary" size="sm">
              {t("spy.goCarousels")}
            </ButtonLink>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
              {t("spy.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void start()}
              loading={busy}
              disabled={busy || languages.length === 0}
            >
              {t("spy.processStart")}
            </Button>
          </>
        )
      }
    >
      {started ? (
        <Notice tone="info">{t("spy.processStarted")}</Notice>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
            {t("spy.processBody")}
          </p>
          <WritingOptions
            languages={languages}
            onToggleLanguage={(l) =>
              setLanguages((current) =>
                current.includes(l) ? current.filter((x) => x !== l) : [...current, l],
              )
            }
            overlayStyle={overlayStyle}
            onOverlayStyle={setOverlayStyle}
          />
          <ImageModeChoice value={imageMode} onChange={setImageMode} hasPexels={hasPexels} />
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
      )}
    </Dialog>
  );
}

"use client";

import { useRef, useState } from "react";
import { Button, Field } from "@/components/ui";
import { WritingOptions } from "@/components/tiktok/WritingOptions";
import {
  translator,
  type ContentLocale,
  type TranslationKey,
} from "@/lib/i18n";
import type { OverlayStyle } from "@/lib/overlay";
import type { CarouselRecord } from "@/lib/types";

interface Props {
  languages: ContentLocale[];
  onToggleLanguage: (lang: ContentLocale) => void;
  overlayStyle: OverlayStyle;
  onOverlayStyle: (style: OverlayStyle) => void;
  canGenerate: boolean;
  onStarted: (carousel: CarouselRecord) => void;
}

/** A screenshot is a phone screen; nothing here needs more than this. */
const MAX_EDGE = 1600;

/**
 * Shrinks a screenshot before it leaves the browser.
 *
 * A phone screenshot is several megabytes, and a dozen of them in a row would
 * run past the request limit long before they reached the model - which only
 * ever sees a description of what is in frame anyway.
 */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * Rebuilds someone else's carousel as ours, from screenshots.
 *
 * Screenshots rather than a link, deliberately: pulling other people's posts
 * down automatically is against TikTok's terms, and this app is in front of
 * their reviewers. A screenshot is something the operator already has.
 */
export function RepostPanel({
  languages,
  onToggleLanguage,
  overlayStyle,
  onOverlayStyle,
  canGenerate,
  onStarted,
}: Props) {
  const t = translator();
  const input = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (files.length === 0) return;
    setBusy(true);
    setSent(0);
    setError(null);

    try {
      const urls: string[] = [];
      for (const file of files) {
        const dataUrl = await shrink(file);
        const res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const data = (await res.json()) as {
          url?: string;
          error?: { message?: string };
        };
        if (!res.ok || !data.url) {
          setError(data.error?.message ?? t("preview.requestFailed"));
          return;
        }
        urls.push(data.url);
        setSent(urls.length);
      }

      const res = await fetch("/api/carousels/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: urls, languages, overlayStyle }),
      });
      const data = (await res.json()) as {
        carousel?: CarouselRecord;
        error?: { message?: string };
      };
      if (!res.ok || !data.carousel) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      onStarted(data.carousel);
      setFiles([]);
      if (input.current) input.current.value = "";
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  /* Same reasoning as the other panel: say why the button is dead. */
  const blocked: TranslationKey | null = !canGenerate
    ? "carousels.blockedNoKey"
    : files.length === 0
      ? "repost.blockedFiles"
      : languages.length === 0
        ? "carousels.blockedLanguages"
        : null;

  /*
   * Two phases, not one.
   *
   * The label used to revert to the idle text the moment the last upload
   * landed - which is exactly when the slow part starts, so the button sat
   * spinning under a label that said it had not begun.
   */
  const label = !busy
    ? t("repost.start", { n: files.length })
    : sent < files.length
      ? t("repost.sending", { done: sent, total: files.length })
      : t("repost.reading");

  return (
    <div className="grid max-w-[760px] gap-5">
      {/*
        No card and no heading here: the tab already names this panel, and the
        parent already pads it. Both were drawn a second time, as a bordered
        white card floating on a bordered white card.
      */}
      <Field label={t("repost.pick")} hint={t("repost.pickHint")}>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          aria-label={t("repost.pick")}
          onChange={(e) => {
            setError(null);
            setFiles(Array.from(e.target.files ?? []));
          }}
          className="input cursor-pointer"
        />
        {files.length > 0 ? (
          <p className="text-[12.5px] text-[var(--color-ink-soft)]">
            {t("repost.chosen", { n: files.length })}
          </p>
        ) : null}
      </Field>

      {error ? (
        <p className="text-[12.5px] text-[var(--color-danger)]">{error}</p>
      ) : null}

      <WritingOptions
        languages={languages}
        onToggleLanguage={onToggleLanguage}
        overlayStyle={overlayStyle}
        onOverlayStyle={onOverlayStyle}
      />

      <div className="border-t border-[var(--color-line)] pt-5">
        <Button variant="primary" onClick={() => void start()} loading={busy} disabled={busy || blocked !== null}>
          {label}
        </Button>
        {blocked && !busy ? (
          <p className="mt-2 text-[12.5px] text-[var(--color-ink-faint)]">
            {t(blocked)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

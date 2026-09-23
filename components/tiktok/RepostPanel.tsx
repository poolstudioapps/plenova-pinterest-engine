"use client";

import { useRef, useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { translator, type ContentLocale, type Locale } from "@/lib/i18n";
import type { OverlayStyle } from "@/lib/overlay";
import type { CarouselRecord } from "@/lib/types";

interface Props {
  uiLocale: Locale;
  languages: ContentLocale[];
  overlayStyle: OverlayStyle;
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
  uiLocale,
  languages,
  overlayStyle,
  canGenerate,
  onStarted,
}: Props) {
  const t = translator(uiLocale);
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

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold">{t("repost.title")}</h2>
      <p className="mt-1 mb-4 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
        {t("repost.body")}
      </p>

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
        className="block w-full text-[13px] file:mr-3 file:rounded-[9px] file:border file:border-[var(--color-line)] file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
      />

      <p className="mt-2 text-[12px] text-[var(--color-ink-faint)]">
        {files.length > 0
          ? t("repost.chosen", { n: files.length })
          : t("repost.none")}{" "}
        {t("repost.order")}
      </p>

      {error ? (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-4">
        <Button
          variant="primary"
          onClick={() => void start()}
          loading={busy}
          disabled={!canGenerate || files.length === 0 || languages.length === 0}
        >
          {busy && sent < files.length
            ? t("repost.sending", { done: sent, total: files.length })
            : t("repost.start", { n: files.length })}
        </Button>
      </div>
    </Card>
  );
}

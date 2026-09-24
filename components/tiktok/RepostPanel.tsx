"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, FileDropZone, SortableGrid } from "@/components/ui";
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

/** One chosen screenshot, with a preview URL and the moment it was taken. */
interface Shot {
  id: string;
  file: File;
  url: string;
  at: number;
}

/*
 * When a screenshot was taken - from its name first, its file date second.
 *
 * A screenshot moved from the phone to the computer usually carries the
 * transfer time as its file date, so a batch copied in one go would all share
 * one timestamp and sort arbitrarily. Phones write the capture time into the
 * name instead - "Screenshot_20260923-101338", "Capture d'ecran 2026-09-23
 * 101338", "Screenshot 2026-09-23 at 10.13.38", "IMG_20260923_101338" - and
 * that is the order the carousel was
 * swiped in.
 */
const NAME_TIME =
  /(20\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)\D{0,5}?([0-2]\d)[.:h_-]?([0-5]\d)(?:[.:m_-]?([0-5]\d))?/;

function captureTime(file: File): number {
  const m = file.name.match(NAME_TIME);
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    const t = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(se ?? 0),
    ).getTime();
    if (Number.isFinite(t)) return t;
  }
  return file.lastModified;
}

let shotSeq = 0;
function toShot(file: File): Shot {
  shotSeq += 1;
  return {
    id: `shot-${shotSeq}`,
    file,
    url: URL.createObjectURL(file),
    at: captureTime(file),
  };
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

  const [shots, setShots] = useState<Shot[]>([]);
  /*
   * Once the operator has reordered by hand, their order wins: screenshots
   * added afterwards go to the end instead of re-sorting everything by date
   * and undoing the work.
   */
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Preview URLs hold the image in memory until released.
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(
    () => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)),
    [],
  );

  function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setError(null);
    const fresh = images.map(toShot).sort((a, b) => a.at - b.at);
    setShots((current) =>
      manual
        ? [...current, ...fresh]
        : [...current, ...fresh].sort((a, b) => a.at - b.at),
    );
  }

  function removeShot(id: string) {
    setShots((current) => {
      const gone = current.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return current.filter((s) => s.id !== id);
    });
  }

  function reorder(ids: string[]) {
    setManual(true);
    setShots((current) => {
      const byId = new Map(current.map((s) => [s.id, s]));
      return ids.map((id) => byId.get(id)).filter((s): s is Shot => Boolean(s));
    });
  }

  function clearShots() {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setManual(false);
  }

  const files = shots.map((s) => s.file);

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
      clearShots();
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
    ? files.length > 0
      ? t("repost.start", { n: files.length })
      : t("repost.startEmpty")
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
          hidden
          aria-label={t("repost.pick")}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <FileDropZone onFiles={addFiles} label={t("repost.dropHere")} disabled={busy}>
          {shots.length === 0 ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] px-6 py-10 text-center transition-colors hover:border-[var(--color-accent)]"
            >
              <span className="text-[14px] font-medium text-[var(--color-ink)]">
                {t("repost.dropTitle")}
              </span>
              <span className="text-[12.5px] text-[var(--color-ink-faint)]">
                {t("repost.dropBody")}
              </span>
            </button>
          ) : (
            <div className="space-y-3">
              <SortableGrid
                items={shots}
                getId={(s) => s.id}
                onReorder={reorder}
                disabled={busy}
                itemLabel={(_, i, n) => t("repost.shotLabel", { i: i + 1, n })}
                className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6"
                renderItem={(shot, { index }) => (
                  <div className="overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shot.url}
                      alt=""
                      draggable={false}
                      className="aspect-[9/16] w-full object-cover"
                    />
                    <span className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-[var(--radius-pill)] bg-[var(--color-ink-fill)] text-[11.5px] font-semibold text-[var(--color-canvas)]">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeShot(shot.id)}
                      aria-label={t("repost.remove")}
                      className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-[var(--radius-pill)] bg-[color-mix(in_oklab,var(--color-surface)_88%,transparent)] text-[13px] text-[var(--color-ink)] shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                    >
                      ×
                    </button>
                  </div>
                )}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] text-[var(--color-ink-soft)]">
                  {manual
                    ? t("repost.orderManual", { n: shots.length })
                    : t("repost.orderByDate", { n: shots.length })}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={clearShots} disabled={busy}>
                    {t("repost.clear")}
                  </Button>
                  <Button size="sm" onClick={() => input.current?.click()} disabled={busy}>
                    {t("repost.add")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </FileDropZone>
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

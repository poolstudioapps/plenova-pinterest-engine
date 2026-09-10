"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Notice, Select } from "@/components/ui";
import {
  OVERLAY_STYLES,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  blockLayout,
  defaultOverlay,
  normaliseOverlay,
  renderBlockInner,
  type OverlayBlock,
  type OverlayStyle,
  type SlideOverlay,
} from "@/lib/overlay";
import {
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n";
import type { CarouselRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  uiLocale: Locale;
  carousel: CarouselRecord;
  index: number;
  language: ContentLocale;
  onClose: () => void;
  onSaved: (carousel: CarouselRecord) => void;
}

type BlockKey = "title" | "subtitle";

const BLOCKS: BlockKey[] = ["title", "subtitle"];

const STYLE_LABELS: Record<OverlayStyle, TranslationKey> = {
  stroke: "editor.styleStroke",
  pillWhite: "editor.stylePillWhite",
  pillBlack: "editor.stylePillBlack",
  none: "editor.styleNone",
};

const WEIGHTS = [400, 500, 600, 700, 800, 900];

/** Corner handles, in the order they are drawn. */
const CORNERS = ["nw", "ne", "sw", "se"] as const;
type Corner = (typeof CORNERS)[number];

/**
 * Direct-manipulation editor for one slide.
 *
 * The preview is the slide at full 1080x1350, scaled down by a CSS transform
 * rather than re-laid-out at a smaller size. That is what makes it honest: the
 * same markup and the same geometry the capture uses, so nothing shifts
 * between what is dragged here and what ends up in the JPEG.
 *
 * Words belong to a language; position, size and style belong to the slide.
 * Editing French does not move the English text, which is the only way seven
 * translations stay one design.
 */
export function SlideEditor({
  uiLocale,
  carousel,
  index,
  language,
  onClose,
  onSaved,
}: Props) {
  const t = translator(uiLocale);
  const slide = carousel.slides[index];

  const [overlay, setOverlay] = useState<SlideOverlay>(() =>
    slide?.overlay ? normaliseOverlay(slide.overlay) : defaultOverlay(),
  );
  const [texts, setTexts] = useState<
    Record<string, { title: string; subtitle: string }>
  >(() => {
    const out: Record<string, { title: string; subtitle: string }> = {};
    for (const lang of carousel.languages) {
      out[lang] = {
        title: slide?.text[lang]?.title ?? "",
        subtitle: slide?.text[lang]?.subtitle ?? "",
      };
    }
    return out;
  });
  const [displayLang, setDisplayLang] = useState<ContentLocale>(language);
  const [selected, setSelected] = useState<BlockKey>("title");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.33);

  // The preview is the real 1080x1350 slide scaled to whatever room it has.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / SLIDE_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const current = texts[displayLang] ?? { title: "", subtitle: "" };

  function setBlock(key: BlockKey, patch: Partial<OverlayBlock>) {
    setOverlay((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
  }

  function setText(key: BlockKey, value: string) {
    setTexts((all) => ({
      ...all,
      [displayLang]: { ...(all[displayLang] ?? { title: "", subtitle: "" }), [key]: value },
    }));
  }

  // ---------------------------------------------------------------- dragging

  const drag = useRef<{
    key: BlockKey;
    corner: Corner | null;
    startX: number;
    startY: number;
    block: OverlayBlock;
  } | null>(null);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const el = canvasRef.current;
    if (!el) return;

    // Pointer pixels are canvas pixels; the block lives in source pixels.
    const factor = SLIDE_WIDTH / el.clientWidth;
    const dx = (event.clientX - state.startX) * factor;
    const dy = (event.clientY - state.startY) * factor;
    const b = state.block;

    if (!state.corner) {
      drag.current &&
        setBlockDirect(state.key, {
          x: clamp(Math.round(b.x + dx), 40, SLIDE_WIDTH - 40),
          y: clamp(Math.round(b.y + dy), 40, SLIDE_HEIGHT - 40),
        });
      return;
    }

    // Resizing grows the block around its centre, and the type with it, so a
    // block keeps looking like itself instead of reflowing at every drag.
    const sx = state.corner === "ne" || state.corner === "se" ? 1 : -1;
    const sy = state.corner === "sw" || state.corner === "se" ? 1 : -1;
    const width = Math.max(80, b.width + sx * dx * 2);
    const height = Math.max(40, b.height + sy * dy * 2);
    const ratio = Math.min(width / b.width, height / b.height);
    setBlockDirect(state.key, {
      width: Math.round(Math.min(SLIDE_WIDTH - 40, width)),
      height: Math.round(Math.min(SLIDE_HEIGHT - 40, height)),
      fontSize: clamp(Math.round(b.fontSize * ratio), 16, 240),
    });
  }, []);

  // Kept out of `setBlock` so the pointer handler is not re-created per render.
  const setBlockDirect = useCallback(
    (key: BlockKey, patch: Partial<OverlayBlock>) => {
      setOverlay((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
    },
    [],
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  function startDrag(
    event: React.PointerEvent,
    key: BlockKey,
    corner: Corner | null,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelected(key);
    drag.current = {
      key,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      block: overlay[key],
    };
  }

  // ------------------------------------------------------------------ saving

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/carousels/${carousel.id}/slides/${index}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: texts, overlay }),
        },
      );
      const data = (await res.json()) as {
        carousel?: CarouselRecord;
        error?: { message?: string };
      };
      if (!res.ok || !data.carousel) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      onSaved(data.carousel);
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setSaving(false);
    }
  }

  if (!slide) return null;

  const src = `/api/carousels/${carousel.id}/slides/${index}/raw`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <Card className="max-h-[94vh] w-full max-w-5xl overflow-y-auto p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold">
            {t("editor.title", { n: index + 1 })}
          </h2>

          {carousel.languages.length > 1 ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-ink-faint)]">
                {t("editor.displayLanguage")}
              </span>
              <div className="flex gap-1">
                {carousel.languages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setDisplayLang(lang)}
                    aria-pressed={lang === displayLang}
                    className={cn(
                      "rounded-[8px] border px-2.5 py-1 text-[12px] transition-colors",
                      lang === displayLang
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]",
                    )}
                  >
                    {CONTENT_LOCALE_LABELS[lang]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* ------------------------------------------------------ canvas */}
          <div>
            <div
              ref={canvasRef}
              className="relative w-full select-none overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-black"
              style={{ aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}` }}
            >
              <div
                style={{
                  width: SLIDE_WIDTH,
                  height: SLIDE_HEIGHT,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  position: "absolute",
                  fontFamily: "'TikTok Sans', system-ui, sans-serif",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />

                {BLOCKS.map((key) => {
                  const block = overlay[key];
                  const text = current[key];
                  const isSelected = selected === key;
                  return (
                    <div
                      key={key}
                      onPointerDown={(e) => startDrag(e, key, null)}
                      style={{
                        ...(blockLayout(block) as React.CSSProperties),
                        cursor: "move",
                        outline: isSelected
                          ? `${Math.round(3 / scale)}px dashed rgba(255,255,255,0.9)`
                          : `${Math.round(2 / scale)}px dashed rgba(255,255,255,0.35)`,
                        outlineOffset: 0,
                      }}
                    >
                      <div
                        style={{ width: "100%", textAlign: block.align }}
                        dangerouslySetInnerHTML={{
                          __html: renderBlockInner(text, block, overlay.style),
                        }}
                      />
                      {isSelected
                        ? CORNERS.map((corner) => (
                            <span
                              key={corner}
                              onPointerDown={(e) => startDrag(e, key, corner)}
                              style={{
                                position: "absolute",
                                width: Math.round(14 / scale),
                                height: Math.round(14 / scale),
                                background: "#fff",
                                border: `${Math.round(2 / scale)}px solid #111`,
                                borderRadius: Math.round(4 / scale),
                                cursor: "nwse-resize",
                                top: corner.startsWith("n")
                                  ? -Math.round(7 / scale)
                                  : undefined,
                                bottom: corner.startsWith("s")
                                  ? -Math.round(7 / scale)
                                  : undefined,
                                left: corner.endsWith("w")
                                  ? -Math.round(7 / scale)
                                  : undefined,
                                right: corner.endsWith("e")
                                  ? -Math.round(7 / scale)
                                  : undefined,
                              }}
                            />
                          ))
                        : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="mt-2 text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
              {t("editor.drag")}
            </p>
          </div>

          {/* ---------------------------------------------------- controls */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[12px] font-medium">
                {t("editor.slideStyle")}
              </label>
              <Select
                value={overlay.style}
                onChange={(e) =>
                  setOverlay((o) => ({
                    ...o,
                    style: e.target.value as OverlayStyle,
                  }))
                }
              >
                {OVERLAY_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {t(STYLE_LABELS[style])}
                  </option>
                ))}
              </Select>
            </div>

            {BLOCKS.map((key) => (
              <BlockControls
                key={key}
                t={t}
                label={t(
                  key === "title" ? "editor.blockTitle" : "editor.blockSubtitle",
                )}
                block={overlay[key]}
                text={current[key]}
                active={selected === key}
                onFocus={() => setSelected(key)}
                onText={(value) => setText(key, value)}
                onChange={(patch) => setBlock(key, patch)}
                emptyHint={
                  current[key].trim()
                    ? null
                    : t("editor.empty", {
                        lang: CONTENT_LOCALE_LABELS[displayLang],
                      })
                }
              />
            ))}

            <p className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
              {t("editor.hint")}
            </p>

            {error ? <Notice tone="danger">{error}</Notice> : null}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => setOverlay(defaultOverlay(overlay.style))}
              >
                {t("editor.reset")}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                {t("editor.cancel")}
              </Button>
              <Button variant="primary" onClick={save} loading={saving}>
                {saving ? t("editor.saving") : t("editor.save")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ControlsProps {
  t: ReturnType<typeof translator>;
  label: string;
  block: OverlayBlock;
  text: string;
  active: boolean;
  emptyHint: string | null;
  onFocus: () => void;
  onText: (value: string) => void;
  onChange: (patch: Partial<OverlayBlock>) => void;
}

function BlockControls({
  t,
  label,
  block,
  text,
  active,
  emptyHint,
  onFocus,
  onText,
  onChange,
}: ControlsProps) {
  const effective = block.style ?? null;
  const showsStroke = effective === "stroke" || effective === null;

  return (
    <div
      onFocusCapture={onFocus}
      className={cn(
        "rounded-[10px] border p-3 transition-colors",
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]/40"
          : "border-[var(--color-line)]",
      )}
    >
      <p className="mb-1.5 text-[12px] font-semibold">{label}</p>

      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={2}
        className="w-full rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]"
      />
      {emptyHint ? (
        <p className="mt-1 text-[11px] text-[var(--color-danger)]">{emptyHint}</p>
      ) : null}

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11.5px] font-medium">
            {t("editor.blockStyle")}
          </label>
          <Select
            value={block.style ?? ""}
            onChange={(e) =>
              onChange({
                style: e.target.value ? (e.target.value as OverlayStyle) : null,
              })
            }
          >
            <option value="">{t("editor.styleInherit")}</option>
            {OVERLAY_STYLES.map((style) => (
              <option key={style} value={style}>
                {t(STYLE_LABELS[style])}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-[11.5px] font-medium">
            {t("editor.align")}
          </label>
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => onChange({ align })}
                aria-pressed={block.align === align}
                className={cn(
                  "flex-1 rounded-[8px] border py-1.5 text-[12px] transition-colors",
                  block.align === align
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]",
                )}
              >
                {align === "left" ? "◀" : align === "right" ? "▶" : "◆"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 flex items-center justify-between text-[11.5px] font-medium">
            {t("editor.size")}
            <span className="text-[var(--color-ink-faint)]">
              {block.fontSize}
            </span>
          </label>
          <input
            type="range"
            min={16}
            max={240}
            value={block.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11.5px] font-medium">
            {t("editor.weight")}
          </label>
          <Select
            value={String(block.fontWeight)}
            onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
          >
            {WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 flex items-center justify-between text-[11.5px] font-medium">
            {t("editor.lineHeight")}
            <span className="text-[var(--color-ink-faint)]">
              {block.lineHeight.toFixed(2)}
            </span>
          </label>
          <input
            type="range"
            min={0.9}
            max={2.5}
            step={0.05}
            value={block.lineHeight}
            onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>

        {showsStroke ? (
          <>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium">
                {t("editor.strokeColor")}
              </label>
              <input
                type="color"
                value={block.strokeColor}
                onChange={(e) => onChange({ strokeColor: e.target.value })}
                className="h-8 w-full cursor-pointer rounded-[8px] border border-[var(--color-line)] bg-transparent"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-[11.5px] font-medium">
                {t("editor.strokeWidth")}
                <span className="text-[var(--color-ink-faint)]">
                  {block.strokeWidth}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={40}
                value={block.strokeWidth}
                onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
                className="w-full accent-[var(--color-accent)]"
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

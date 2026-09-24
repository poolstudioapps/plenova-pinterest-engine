"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Notice, Picker } from "@/components/ui";
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
import { usePillPaths } from "@/components/tiktok/usePillPaths";
import { slideImageSrc } from "@/lib/slide-image";
import {
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
  type TranslationKey,
} from "@/lib/i18n";
import type { CarouselRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  carousel: CarouselRecord;
  index: number;
  language: ContentLocale;
  onClose: () => void;
  onSaved: (carousel: CarouselRecord) => void;
}

type BlockKey = "title" | "subtitle" | "cta";

const BLOCKS: BlockKey[] = ["title", "subtitle", "cta"];

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
/** The buttons show only an arrow, so this is their whole description. */
const ALIGN_LABELS: Record<"left" | "center" | "right", string> = {
  left: "gauche",
  center: "centré",
  right: "droite",
};

export function SlideEditor({
  carousel,
  index,
  language,
  onClose,
  onSaved,
}: Props) {
  const t = translator();
  const slide = carousel.slides[index];

  const [overlay, setOverlay] = useState<SlideOverlay>(() =>
    slide?.overlay ? normaliseOverlay(slide.overlay) : defaultOverlay(),
  );
  const [texts, setTexts] = useState<
    Record<string, { title: string; subtitle: string; cta: string }>
  >(() => {
    const out: Record<string, { title: string; subtitle: string; cta: string }> =
      {};
    for (const lang of carousel.languages) {
      out[lang] = {
        title: slide?.text[lang]?.title ?? "",
        subtitle: slide?.text[lang]?.subtitle ?? "",
        cta: slide?.text[lang]?.cta ?? "",
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
  const [imageBroken, setImageBroken] = useState(false);

  /**
   * Undo and redo over the layout.
   *
   * Consecutive touches of the same control inside a second collapse into one
   * step, so dragging a slider leaves one entry rather than forty and undo
   * moves by something the eye can see.
   */
  const [past, setPast] = useState<SlideOverlay[]>([]);
  const [future, setFuture] = useState<SlideOverlay[]>([]);
  const lastCommit = useRef<{ key: string; at: number } | null>(null);

  const commit = useCallback(
    (key: string) => {
      const now = Date.now();
      const last = lastCommit.current;
      lastCommit.current = { key, at: now };
      if (last && last.key === key && now - last.at < 900) return;
      setOverlay((current) => {
        setPast((p) => [...p.slice(-49), current]);
        setFuture([]);
        return current;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1]!;
      setOverlay((current) => {
        setFuture((f) => [current, ...f.slice(0, 49)]);
        return previous;
      });
      lastCommit.current = null;
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0]!;
      setOverlay((current) => {
        setPast((p) => [...p, current]);
        return next;
      });
      lastCommit.current = null;
      return f.slice(1);
    });
  }, []);

  /** Guides shown while a block is being dragged onto an alignment. */
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({
    x: [],
    y: [],
  });

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

  const current = texts[displayLang] ?? { title: "", subtitle: "", cta: "" };
  // The TikTok outlines for whatever is on screen, re-measured only when the
  // words or their typography change - never on a drag.
  const pills = usePillPaths(
    BLOCKS.map((key) => ({
      text: current[key] ?? "",
      block: overlay[key],
      style: overlay.style,
    })),
  );

  function setBlock(key: BlockKey, patch: Partial<OverlayBlock>) {
    // Keyed by the field so dragging one slider collapses into a single step.
    commit(`${key}:${Object.keys(patch).join(",")}`);
    setOverlay((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
  }

  function setText(key: BlockKey, value: string) {
    setTexts((all) => ({
      ...all,
      [displayLang]: {
        ...(all[displayLang] ?? { title: "", subtitle: "", cta: "" }),
        [key]: value,
      },
    }));
  }

  // ---------------------------------------------------------------- dragging

  const drag = useRef<{
    key: BlockKey;
    corner: Corner | null;
    startX: number;
    startY: number;
    block: OverlayBlock;
    /** The other blocks' anchors, for alignment. */
    others: { x: number; y: number }[];
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
      const wanted = {
        x: clamp(Math.round(b.x + dx), 40, SLIDE_WIDTH - 40),
        y: clamp(Math.round(b.y + dy), 40, SLIDE_HEIGHT - 40),
      };
      // Snap to the canvas centre and to whatever the other blocks are
      // aligned on, and show the line that was caught.
      const snapped = snapTo(wanted, state.key, state.others);
      setGuides(snapped.guides);
      setBlockDirect(state.key, { x: snapped.x, y: snapped.y });
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
    setGuides({ x: [], y: [] });
  }, []);

  /**
   * Keyboard: escape closes, the arrows move the selected block, and undo and
   * redo work as they do everywhere else.
   *
   * The arrows matter beyond convenience - before this there was no way at all
   * to position a block without a pointer.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if (event.key === "Escape") {
        onClose();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;

      const step = event.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      commit(`nudge:${selected}`);
      setOverlay((o) => ({
        ...o,
        [selected]: {
          ...o[selected],
          x: clamp(o[selected].x + move[0], 40, SLIDE_WIDTH - 40),
          y: clamp(o[selected].y + move[1], 40, SLIDE_HEIGHT - 40),
        },
      }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, undo, redo, commit, selected]);

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
    // The element keeps the pointer for the whole gesture. Without it a touch
    // drag scrolls the dialog instead of moving the block, and a mouse
    // released outside the window leaves the block stuck to the cursor.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelected(key);
    commit(`drag:${key}`);
    drag.current = {
      key,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      block: overlay[key],
      others: BLOCKS.filter((k) => k !== key).map((k) => ({
        x: overlay[k].x,
        y: overlay[k].y,
      })),
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

  const src = slideImageSrc(carousel.id, index, slide);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("editor.title", { n: index + 1 })}
    >
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
                  onError={() => setImageBroken(true)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />

                {guides.x.map((x) => (
                  <div
                    key={`gx-${x}`}
                    style={{
                      position: "absolute",
                      left: x,
                      top: 0,
                      width: Math.max(2, Math.round(2 / scale)),
                      height: SLIDE_HEIGHT,
                      background: "#ff2d9b",
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                    }}
                  />
                ))}
                {guides.y.map((y) => (
                  <div
                    key={`gy-${y}`}
                    style={{
                      position: "absolute",
                      top: y,
                      left: 0,
                      height: Math.max(2, Math.round(2 / scale)),
                      width: SLIDE_WIDTH,
                      background: "#ff2d9b",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                    }}
                  />
                ))}

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
                        // Stops the browser claiming the gesture as a scroll.
                        touchAction: "none",
                        outline: isSelected
                          ? `${Math.round(3 / scale)}px dashed rgba(255,255,255,0.9)`
                          : `${Math.round(2 / scale)}px dashed rgba(255,255,255,0.35)`,
                        outlineOffset: 0,
                      }}
                    >
                      <div
                        style={{ position: "relative", width: "100%", textAlign: block.align }}
                        dangerouslySetInnerHTML={{
                          __html: renderBlockInner(
                            text,
                            block,
                            overlay.style,
                            pills[BLOCKS.indexOf(key)],
                          ),
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
                                cursor:
                                  corner === "nw" || corner === "se"
                                    ? "nwse-resize"
                                    : "nesw-resize",
                                touchAction: "none",
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

            {imageBroken ? (
              <div className="mt-2">
                <Notice tone="danger">{t("editor.imageBroken")}</Notice>
              </div>
            ) : null}
            <p className="mt-2 text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
              {t("editor.drag")} {t("editor.keys")}
            </p>
          </div>

          {/* ---------------------------------------------------- controls */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[12px] font-medium">
                {t("editor.slideStyle")}
              </label>
              <Picker
                options={OVERLAY_STYLES.map((style) => ({
                  value: style,
                  label: t(STYLE_LABELS[style]),
                }))}
                value={overlay.style}
                onChange={(v) => {
                  commit("slide:style");
                  setOverlay((o) => ({
                    ...o,
                    style: v as OverlayStyle,
                  }));
                }}
              />
            </div>

            {BLOCKS.map((key) => (
              <BlockControls
                key={key}
                t={t}
                label={t(
                  key === "title"
                    ? "editor.blockTitle"
                    : key === "subtitle"
                      ? "editor.blockSubtitle"
                      : "editor.blockCta",
                )}
                block={overlay[key]}
                text={current[key]}
                active={selected === key}
                onFocus={() => setSelected(key)}
                onText={(value) => setText(key, value)}
                onChange={(patch) => setBlock(key, patch)}
                slideStyle={overlay.style}
                emptyHint={
                  key === "cta"
                    ? t("editor.ctaHint")
                    : current[key].trim()
                      ? null
                      : t("editor.empty", {
                          lang: CONTENT_LOCALE_LABELS[displayLang],
                        })
                }
                hintTone={key === "cta" ? "muted" : "warn"}
              />
            ))}

            <p className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
              {t("editor.hint")}
            </p>

            {error ? <Notice tone="danger">{error}</Notice> : null}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={undo}
                disabled={past.length === 0}
                title="Ctrl+Z"
              >
                {t("editor.undo")}
              </Button>
              <Button
                variant="ghost"
                onClick={redo}
                disabled={future.length === 0}
                title="Ctrl+Shift+Z"
              >
                {t("editor.redo")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  commit("reset");
                  setOverlay(defaultOverlay(overlay.style));
                }}
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

/** How close a block has to come, in source pixels, before it clicks on. */
const SNAP = 14;

/**
 * Pulls a dragged block onto the canvas centre or onto another block's anchor.
 *
 * Returns the lines that were caught so they can be drawn, which is the half
 * that makes snapping feel deliberate rather than like the block sticking.
 */
function snapTo(
  wanted: { x: number; y: number },
  _key: BlockKey,
  others: { x: number; y: number }[],
): { x: number; y: number; guides: { x: number[]; y: number[] } } {
  const candidatesX = [SLIDE_WIDTH / 2, ...others.map((o) => o.x)];
  const candidatesY = [SLIDE_HEIGHT / 2, ...others.map((o) => o.y)];

  const pick = (value: number, candidates: number[]) => {
    let best: number | null = null;
    for (const candidate of candidates) {
      if (Math.abs(candidate - value) > SNAP) continue;
      if (best === null || Math.abs(candidate - value) < Math.abs(best - value)) {
        best = candidate;
      }
    }
    return best;
  };

  const x = pick(wanted.x, candidatesX);
  const y = pick(wanted.y, candidatesY);
  return {
    x: x ?? wanted.x,
    y: y ?? wanted.y,
    guides: { x: x === null ? [] : [x], y: y === null ? [] : [y] },
  };
}

interface ControlsProps {
  t: ReturnType<typeof translator>;
  label: string;
  block: OverlayBlock;
  text: string;
  active: boolean;
  emptyHint: string | null;
  hintTone: "warn" | "muted";
  onFocus: () => void;
  onText: (value: string) => void;
  onChange: (patch: Partial<OverlayBlock>) => void;
  slideStyle: OverlayStyle;
}

function BlockControls({
  t,
  label,
  block,
  text,
  active,
  emptyHint,
  hintTone,
  onFocus,
  onText,
  onChange,
  slideStyle,
}: ControlsProps) {
  // The style that will actually be used: the block's own, or the slide's when
  // it inherits. Showing outline controls for a pill was offering settings
  // that changed nothing.
  const showsStroke = (block.style ?? slideStyle) === "stroke";

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
        aria-label={label}
        // The server clamps these lengths, so the editor stops at the same
        // point rather than letting a long line be trimmed without a word.
        maxLength={400}
        onChange={(e) => onText(e.target.value)}
        rows={2}
        className="w-full rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]"
      />
      {emptyHint ? (
        <p
          className={cn(
            "mt-1 text-[11px]",
            hintTone === "warn"
              ? "text-[var(--color-danger)]"
              : "text-[var(--color-ink-faint)]",
          )}
        >
          {emptyHint}
        </p>
      ) : null}

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11.5px] font-medium">
            {t("editor.blockStyle")}
          </label>
          <Picker
            options={[
              // "Comme la slide" is the one row whose meaning depends on
              // something else, so it carries what it resolves to right now.
              {
                value: "",
                label: t("editor.styleInherit"),
                detail: t(STYLE_LABELS[slideStyle]),
              },
              ...OVERLAY_STYLES.map((style) => ({
                value: style,
                label: t(STYLE_LABELS[style]),
              })),
            ]}
            value={block.style ?? ""}
            onChange={(v) =>
              onChange({
                style: v ? (v as OverlayStyle) : null,
              })
            }
          />
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
                aria-label={`${label} — ${ALIGN_LABELS[align]}`}
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
            aria-label={`${label} — ${t("editor.size")}`}
            value={block.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11.5px] font-medium">
            {t("editor.weight")}
          </label>
          <Picker
            options={WEIGHTS.map((weight) => ({
              value: String(weight),
              label: String(weight),
            }))}
            value={String(block.fontWeight)}
            onChange={(v) => onChange({ fontWeight: Number(v) })}
          />
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
            aria-label={`${label} — ${t("editor.lineHeight")}`}
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
                aria-label={`${label} — ${t("editor.strokeColor")}`}
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
                aria-label={`${label} — ${t("editor.strokeWidth")}`}
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

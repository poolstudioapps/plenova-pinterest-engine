"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePillPaths } from "@/components/tiktok/usePillPaths";
import {
  PHOTO_MAX_ZOOM,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  blockLayout,
  inkOn,
  photoLayout,
  renderBlockInner,
  type OverlayBlock,
  type OverlayStyle,
  type PhotoFrame,
  type SlideOverlay,
} from "@/lib/overlay";
import { PILL, isPillStyle } from "@/lib/pill";
import { cn } from "@/lib/utils";
import {
  GridGuides,
  TikTokZones,
  outsideFrame,
  zonesHit,
  type Box,
  type ZoneId,
} from "./Guides";
import { BLOCKS, TEXT_LIMITS, frameOf, type BlockKey, type SlideWords } from "./state";

/** Corners scale the block and its type together; sides only rewrap it. */
type Handle = "nw" | "ne" | "sw" | "se" | "w" | "e";
const HANDLES: Handle[] = ["nw", "ne", "sw", "se", "w", "e"];

/** The editor's own ink, the one colour no photograph uses for text. */
const CHROME = "#ff2d9b";

export interface CanvasIssue {
  block: BlockKey;
  kind: ZoneId | "outside";
}

type Gesture =
  | {
      kind: "move";
      id: string;
      key: BlockKey;
      startX: number;
      startY: number;
      block: OverlayBlock;
      others: OverlayBlock[];
      moved: boolean;
    }
  | {
      kind: "resize";
      id: string;
      key: BlockKey;
      handle: Handle;
      startX: number;
      startY: number;
      block: OverlayBlock;
    }
  | {
      kind: "pan";
      id: string;
      startX: number;
      startY: number;
      frame: PhotoFrame;
    };

interface Props {
  overlay: SlideOverlay;
  words: SlideWords;
  src: string | null;
  selected: BlockKey | null;
  mode: "layout" | "crop";
  /** The block being typed into, right on the slide. */
  editing: BlockKey | null;
  showZones: boolean;
  showGrid: boolean;
  labels: Record<BlockKey, string>;
  onSelect: (key: BlockKey | null) => void;
  onStartEditing: (key: BlockKey) => void;
  onStopEditing: () => void;
  onText: (key: BlockKey, value: string) => void;
  onBlock: (key: BlockKey, patch: Partial<OverlayBlock>, history: string) => void;
  onPhoto: (patch: Partial<PhotoFrame>, history: string) => void;
  onIssues: (issues: CanvasIssue[]) => void;
  onImageError: () => void;
}

/**
 * The slide itself, at its real 1080x1350, scaled to the room it has.
 *
 * Same markup and same geometry as the capture - `blockLayout`,
 * `renderBlockInner`, `photoLayout` - so nothing shifts between what is placed
 * here and what the JPEG contains.
 */
export function EditorCanvas(props: Props) {
  const { overlay, words, src, selected, mode, editing, showZones, showGrid } = props;

  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  /** The picture's own size, tied to the picture it was read from. */
  const [natural, setNatural] = useState<{ src: string; w: number; h: number } | null>(null);
  const [hot, setHot] = useState<ZoneId[]>([]);
  const textRefs = useRef<Partial<Record<BlockKey, HTMLElement | null>>>({});
  const lastIssues = useRef("");

  // Window listeners are bound once; they read the latest props from here.
  const latest = useRef(props);
  latest.current = props;
  // A new picture has its own proportions; the old ones would mis-pan it.
  // Matched by source rather than reset on change, because a cached picture
  // can report its size before an effect would have cleared the old one.
  const naturalRef = useRef(natural);
  naturalRef.current = natural && natural.src === src ? natural : null;

  const gesture = useRef<Gesture | null>(null);
  const gestureCount = useRef(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / SLIDE_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pills = usePillPaths(
    BLOCKS.map((key) => ({ text: words[key], block: overlay[key], style: overlay.style })),
  );

  // ---------------------------------------------------------------- gestures

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const g = gesture.current;
      const el = boxRef.current;
      if (!g || !el) return;
      // Pointer pixels are screen pixels; the slide lives in its own.
      const factor = SLIDE_WIDTH / el.clientWidth;
      const dx = (event.clientX - g.startX) * factor;
      const dy = (event.clientY - g.startY) * factor;
      const { onBlock, onPhoto } = latest.current;

      if (g.kind === "move") {
        // A click is not a move: it selects, and leaves no undo step behind.
        if (!g.moved && Math.hypot(dx, dy) < 3) return;
        g.moved = true;
        const b = g.block;
        const wanted = {
          x: clamp(b.x + dx, 20, SLIDE_WIDTH - 20),
          y: clamp(b.y + dy, 20, SLIDE_HEIGHT - 20),
        };
        // Alt lets a block sit a hair off a line, as in every design tool.
        const snapped = event.altKey
          ? { ...wanted, guides: { x: [], y: [] } }
          : snapBlock(wanted, b, g.others);
        setGuides(snapped.guides);
        onBlock(g.key, { x: Math.round(snapped.x), y: Math.round(snapped.y) }, g.id);
        return;
      }

      if (g.kind === "resize") {
        const b = g.block;
        if (g.handle === "e" || g.handle === "w") {
          // The opposite side stays put; only the line length changes.
          const s = g.handle === "e" ? 1 : -1;
          const width = clamp(b.width + s * dx, 80, SLIDE_WIDTH);
          onBlock(
            g.key,
            { width: Math.round(width), x: Math.round(b.x + (s * (width - b.width)) / 2) },
            g.id,
          );
          return;
        }
        // The pointer's travel along the block's diagonal sets one ratio, so
        // the block and its type grow together and the far corner stays put.
        const sx = g.handle.endsWith("e") ? 1 : -1;
        const sy = g.handle.startsWith("s") ? 1 : -1;
        const along =
          (sx * dx * b.width + sy * dy * b.height) / (b.width ** 2 + b.height ** 2);
        const r = clamp(
          1 + along,
          Math.max(80 / b.width, 40 / b.height, 16 / b.fontSize),
          Math.min(SLIDE_WIDTH / b.width, SLIDE_HEIGHT / b.height, 240 / b.fontSize),
        );
        const width = b.width * r;
        const height = b.height * r;
        const anchorX = b.x - (sx * b.width) / 2;
        const anchorY = b.y - (sy * b.height) / 2;
        onBlock(
          g.key,
          {
            width: Math.round(width),
            height: Math.round(height),
            fontSize: Math.round(b.fontSize * r),
            x: Math.round(anchorX + (sx * width) / 2),
            y: Math.round(anchorY + (sy * height) / 2),
          },
          g.id,
        );
        return;
      }

      // Panning: the focal point moves against the pointer, at the rate that
      // keeps the picture under the cursor. The range is whatever the cover
      // crop and the zoom leave outside the frame.
      const n = naturalRef.current;
      if (!n) return;
      const cover = Math.max(SLIDE_WIDTH / n.w, SLIDE_HEIGHT / n.h);
      const overflowX = n.w * cover * g.frame.zoom - SLIDE_WIDTH;
      const overflowY = n.h * cover * g.frame.zoom - SLIDE_HEIGHT;
      onPhoto(
        {
          x: overflowX > 1 ? round1(clamp(g.frame.x - (100 * dx) / overflowX, 0, 100)) : g.frame.x,
          y: overflowY > 1 ? round1(clamp(g.frame.y - (100 * dy) / overflowY, 0, 100)) : g.frame.y,
        },
        g.id,
      );
    };
    const onUp = () => {
      gesture.current = null;
      setGuides({ x: [], y: [] });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // The wheel zooms while reframing. Bound by hand: React's wheel listener is
  // passive, and the page must not scroll instead.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (latest.current.mode !== "crop") return;
      event.preventDefault();
      const frame = frameOf(latest.current.overlay);
      const zoom = clamp(frame.zoom * Math.exp(-event.deltaY * 0.0015), 1, PHOTO_MAX_ZOOM);
      latest.current.onPhoto({ zoom: Math.round(zoom * 100) / 100 }, "photo:zoom");
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function nextGestureId() {
    gestureCount.current += 1;
    return `gesture:${gestureCount.current}`;
  }

  /**
   * Whatever held the focus lets go once the slide is touched: a field would
   * take the arrow keys meant for the block, and a thumbnail still ringed from
   * the keyboard would take the Delete meant for it.
   */
  function releaseFocus() {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) active.blur();
  }

  function startMove(event: React.PointerEvent, key: BlockKey) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    releaseFocus();
    props.onSelect(key);
    gesture.current = {
      kind: "move",
      id: nextGestureId(),
      key,
      startX: event.clientX,
      startY: event.clientY,
      block: overlay[key],
      others: BLOCKS.filter((k) => k !== key && words[k].trim()).map((k) => overlay[k]),
      moved: false,
    };
  }

  function startResize(event: React.PointerEvent, key: BlockKey, handle: Handle) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    releaseFocus();
    gesture.current = {
      kind: "resize",
      id: nextGestureId(),
      key,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      block: overlay[key],
    };
  }

  function onBackgroundDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    if (mode === "crop") {
      event.preventDefault();
      releaseFocus();
      gesture.current = {
        kind: "pan",
        id: nextGestureId(),
        startX: event.clientX,
        startY: event.clientY,
        frame: frameOf(overlay),
      };
      return;
    }
    // A click on the photograph lets go of the block.
    props.onSelect(null);
    if (editing) props.onStopEditing();
  }

  // ----------------------------------------------------- what TikTok covers

  // Measured on every render: three rectangles, and the only way to know
  // where the WORDS are rather than where their box is.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || scale === 0) return;
    const origin = box.getBoundingClientRect();
    const found: CanvasIssue[] = [];
    for (const key of BLOCKS) {
      if (!words[key].trim()) continue;
      const host = textRefs.current[key];
      if (!host) continue;
      const target = host.querySelector("span") ?? host;
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const rect: Box = {
        left: (r.left - origin.left) / scale,
        top: (r.top - origin.top) / scale,
        right: (r.right - origin.left) / scale,
        bottom: (r.bottom - origin.top) / scale,
      };
      for (const zone of zonesHit(rect)) found.push({ block: key, kind: zone });
      if (outsideFrame(rect)) found.push({ block: key, kind: "outside" });
    }
    const serial = JSON.stringify(found);
    if (serial === lastIssues.current) return;
    lastIssues.current = serial;
    const zones = Array.from(
      new Set(found.filter((f) => f.kind !== "outside").map((f) => f.kind as ZoneId)),
    );
    setHot(zones);
    latest.current.onIssues(found);
  });

  // ------------------------------------------------------------------ render

  const s = scale || 0.35;
  const px = (n: number) => Math.max(1, Math.round(n / s));

  return (
    <div
      ref={boxRef}
      onPointerDown={onBackgroundDown}
      className={cn(
        "relative w-full select-none overflow-hidden rounded-[14px] bg-black shadow-[var(--shadow-raised)]",
        mode === "crop" && "cursor-grab active:cursor-grabbing",
      )}
      style={{ aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}`, touchAction: "none" }}
      data-editor-canvas
    >
      <div
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          left: 0,
          top: 0,
          fontFamily: "'TikTok Sans', system-ui, sans-serif",
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) =>
              setNatural({
                src,
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            onError={props.onImageError}
            style={photoLayout(frameOf(overlay)) as React.CSSProperties}
          />
        ) : null}

        {showGrid ? <GridGuides /> : null}

        {guides.x.map((x) => (
          <div
            key={`gx-${x}`}
            style={{
              position: "absolute",
              left: x,
              top: 0,
              width: px(1.5),
              height: SLIDE_HEIGHT,
              background: CHROME,
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
              height: px(1.5),
              width: SLIDE_WIDTH,
              background: CHROME,
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          />
        ))}

        {BLOCKS.map((key, i) => {
          const block = overlay[key];
          const text = words[key];
          const empty = !text.trim();
          const isEditing = editing === key;
          const isSelected = selected === key && mode === "layout";
          return (
            <div
              key={key}
              data-block={key}
              onPointerDown={(e) => {
                if (mode !== "layout" || isEditing) return;
                startMove(e, key);
              }}
              onDoubleClick={() => {
                if (mode === "layout") props.onStartEditing(key);
              }}
              style={{
                ...(blockLayout(block) as React.CSSProperties),
                cursor: isEditing ? "text" : "move",
                touchAction: "none",
                pointerEvents: mode === "crop" ? "none" : "auto",
                opacity: mode === "crop" ? 0.3 : 1,
                outline:
                  isSelected || isEditing
                    ? `${px(2)}px solid ${CHROME}`
                    : `${px(1.5)}px dashed rgba(255,255,255,${empty ? 0.28 : 0.45})`,
                outlineOffset: 0,
              }}
            >
              {isEditing ? (
                <InlineText
                  block={block}
                  slideStyle={overlay.style}
                  value={text}
                  limit={TEXT_LIMITS[key]}
                  onChange={(value) => props.onText(key, value)}
                  onDone={props.onStopEditing}
                  hostRef={(el) => {
                    textRefs.current[key] = el;
                  }}
                />
              ) : empty ? (
                // Only in the editor: the capture draws nothing for an empty
                // block, and this says where a double-click would write.
                <span
                  style={{
                    width: "100%",
                    textAlign: "center",
                    fontSize: Math.max(30, Math.round(block.fontSize * 0.42)),
                    fontWeight: 600,
                    fontStyle: "italic",
                    color: "rgba(255,255,255,0.6)",
                    textShadow: "0 2px 6px rgba(0,0,0,0.6)",
                    pointerEvents: "none",
                  }}
                >
                  {props.labels[key]}
                </span>
              ) : (
                <div
                  ref={(el) => {
                    textRefs.current[key] = el;
                  }}
                  style={{ position: "relative", width: "100%", textAlign: block.align }}
                  dangerouslySetInnerHTML={{
                    __html: renderBlockInner(text, block, overlay.style, pills[i]),
                  }}
                />
              )}

              {isSelected && !isEditing
                ? HANDLES.map((handle) => (
                    <span
                      key={handle}
                      data-handle={handle}
                      onPointerDown={(e) => startResize(e, key, handle)}
                      style={handleStyle(handle, s)}
                    />
                  ))
                : null}
            </div>
          );
        })}

        {showZones ? <TikTokZones hot={hot} /> : null}
      </div>
    </div>
  );
}

function handleStyle(handle: Handle, scale: number): React.CSSProperties {
  const px = (n: number) => Math.max(1, Math.round(n / scale));
  const side = handle === "e" || handle === "w";
  const w = side ? px(9) : px(15);
  const h = side ? px(26) : px(15);
  const style: React.CSSProperties = {
    position: "absolute",
    width: w,
    height: h,
    background: "#fff",
    border: `${px(2)}px solid ${CHROME}`,
    borderRadius: side ? px(5) : px(4),
    boxShadow: `0 ${px(1)}px ${px(4)}px rgba(0,0,0,0.35)`,
    touchAction: "none",
    cursor:
      handle === "nw" || handle === "se"
        ? "nwse-resize"
        : handle === "ne" || handle === "sw"
          ? "nesw-resize"
          : "ew-resize",
  };
  if (handle.includes("n")) style.top = -Math.round(h / 2);
  else if (handle.includes("s")) style.bottom = -Math.round(h / 2);
  else {
    style.top = "50%";
    style.transform = "translateY(-50%)";
  }
  if (handle.includes("w")) style.left = -Math.round(w / 2);
  else style.right = -Math.round(w / 2);
  return style;
}

/**
 * Typing straight onto the slide.
 *
 * A plain textarea in the block's own type, colours and box - close to the
 * final look without pretending to be it: the merged TikTok outline is drawn
 * again the moment typing stops, from the real line breaks.
 */
function InlineText({
  block,
  slideStyle,
  value,
  limit,
  onChange,
  onDone,
  hostRef,
}: {
  block: OverlayBlock;
  slideStyle: OverlayStyle;
  value: string;
  limit: number;
  onChange: (value: string) => void;
  onDone: () => void;
  hostRef: (el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const style = block.style ?? slideStyle;
  const pill = isPillStyle(style);
  const color = block.color ?? null;

  // Grows with its lines, so the block keeps its vertical centring.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, block.fontSize, block.width, block.lineHeight, block.fontWeight]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const fill = pill
    ? (color ?? (style === "pillWhite" ? PILL.white.fill : PILL.black.fill))
    : "rgba(0,0,0,0.3)";
  const ink = pill
    ? color
      ? inkOn(color)
      : style === "pillWhite"
        ? PILL.white.ink
        : PILL.black.ink
    : (color ?? "#ffffff");

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        hostRef(el);
      }}
      value={value}
      rows={1}
      maxLength={limit}
      aria-label="Texte du bloc"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Escape leaves the text, not the editor.
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          e.stopPropagation();
          onDone();
        }
      }}
      style={{
        display: "block",
        width: "100%",
        margin: 0,
        padding: `${Math.round(block.fontSize * 0.06)}px ${Math.round(block.fontSize * 0.22)}px`,
        border: "none",
        outline: "none",
        resize: "none",
        overflow: "hidden",
        borderRadius: Math.round(block.fontSize * 0.26),
        background: fill,
        color: ink,
        font: "inherit",
        fontSize: block.fontSize,
        fontWeight: block.fontWeight,
        lineHeight: block.lineHeight,
        textAlign: block.align,
        caretColor: CHROME,
        WebkitTextStroke:
          style === "stroke"
            ? `${Math.round((block.fontSize * block.strokeWidth) / 100)}px ${block.strokeColor}`
            : undefined,
        paintOrder: style === "stroke" ? "stroke fill" : undefined,
      }}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** How close a block has to come, in slide pixels, before it clicks on. */
const SNAP = 12;
/** The breathing room kept along the slide's edges. */
const MARGIN = 60;

/**
 * Pulls a dragged block onto a line: the slide's centre and margins, and the
 * centres and edges of the other blocks - whichever of the block's own centre
 * or edges is nearest. Returns the lines caught, so they can be drawn.
 */
function snapBlock(
  wanted: { x: number; y: number },
  block: OverlayBlock,
  others: OverlayBlock[],
): { x: number; y: number; guides: { x: number[]; y: number[] } } {
  const linesX = [
    SLIDE_WIDTH / 2,
    MARGIN,
    SLIDE_WIDTH - MARGIN,
    ...others.flatMap((o) => [o.x, o.x - o.width / 2, o.x + o.width / 2]),
  ];
  const linesY = [
    SLIDE_HEIGHT / 2,
    MARGIN,
    SLIDE_HEIGHT - MARGIN,
    ...others.flatMap((o) => [o.y, o.y - o.height / 2, o.y + o.height / 2]),
  ];
  const sx = nearest(wanted.x, block.width / 2, linesX);
  const sy = nearest(wanted.y, block.height / 2, linesY);
  return {
    x: wanted.x + (sx?.offset ?? 0),
    y: wanted.y + (sy?.offset ?? 0),
    guides: { x: sx ? [sx.line] : [], y: sy ? [sy.line] : [] },
  };
}

function nearest(
  centre: number,
  half: number,
  lines: number[],
): { offset: number; line: number } | null {
  let pick: { offset: number; line: number } | null = null;
  for (const line of lines) {
    for (const ref of [centre, centre - half, centre + half]) {
      const offset = line - ref;
      if (Math.abs(offset) > SNAP) continue;
      if (!pick || Math.abs(offset) < Math.abs(pick.offset)) pick = { offset, line };
    }
  }
  return pick;
}

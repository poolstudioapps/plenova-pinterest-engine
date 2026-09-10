/**
 * Slide composition.
 *
 * Ported from the carousel-studio renderer, block model included: the layout
 * is plain HTML and CSS rendered by a real browser engine. That matters
 * because the signature looks depend on CSS no server-side HTML-to-image
 * library implements - `-webkit-text-stroke` with `paint-order`, and
 * `box-decoration-break: clone` for per-line pills.
 *
 * Rather than run headless Chromium on a serverless function, the operator's
 * own browser does the render. It is the same engine, so what the editor shows
 * is what the file contains, and there is nothing to install or keep warm.
 *
 * Everything the markup references must be inlined as a data URL: the capture
 * happens inside an SVG foreignObject, which cannot fetch external resources.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

export type OverlayStyle = "stroke" | "pillWhite" | "pillBlack" | "none";

export const OVERLAY_STYLES: OverlayStyle[] = [
  "stroke",
  "pillWhite",
  "pillBlack",
  "none",
];

/**
 * One movable text block.
 *
 * `x` and `y` are the CENTRE of the block in source pixels, which is what
 * makes dragging and resizing behave the way a designer expects: the block
 * grows around its anchor instead of drifting away from it.
 */
export interface OverlayBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: number;
  align: "left" | "center" | "right";
  lineHeight: number;
  /** Overrides the slide style for this block alone. */
  style: OverlayStyle | null;
  strokeColor: string;
  /** Outline thickness as a percentage of the font size. */
  strokeWidth: number;
}

export interface SlideOverlay {
  style: OverlayStyle;
  title: OverlayBlock;
  subtitle: OverlayBlock;
  /** Renders only when the slide has CTA text, so every slide can carry one. */
  cta: OverlayBlock;
}

export const TITLE_DEFAULTS: OverlayBlock = {
  x: 540,
  y: 560,
  width: 900,
  height: 260,
  fontSize: 96,
  fontWeight: 800,
  align: "center",
  lineHeight: 1.1,
  style: null,
  strokeColor: "#11481D",
  strokeWidth: 18,
};

export const SUBTITLE_DEFAULTS: OverlayBlock = {
  x: 540,
  y: 800,
  width: 850,
  height: 180,
  fontSize: 52,
  fontWeight: 700,
  align: "center",
  lineHeight: 1.25,
  style: null,
  strokeColor: "#11481D",
  strokeWidth: 15,
};

export const CTA_DEFAULTS: OverlayBlock = {
  x: 540,
  y: 1180,
  width: 860,
  height: 140,
  fontSize: 40,
  fontWeight: 600,
  align: "center",
  lineHeight: 1.25,
  style: null,
  strokeColor: "#11481D",
  strokeWidth: 14,
};

export function defaultOverlay(style: OverlayStyle = "stroke"): SlideOverlay {
  return {
    style,
    title: { ...TITLE_DEFAULTS },
    subtitle: { ...SUBTITLE_DEFAULTS },
    cta: { ...CTA_DEFAULTS },
  };
}

/** Fills in every field, so a stored overlay from any older shape still renders. */
export function normaliseOverlay(
  raw: unknown,
  fallbackStyle: OverlayStyle = "stroke",
): SlideOverlay {
  const o = (raw ?? {}) as Record<string, unknown>;
  const style = OVERLAY_STYLES.includes(o.style as OverlayStyle)
    ? (o.style as OverlayStyle)
    : fallbackStyle;
  return {
    style,
    title: normaliseBlock(o.title, TITLE_DEFAULTS),
    subtitle: normaliseBlock(o.subtitle, SUBTITLE_DEFAULTS),
    cta: normaliseBlock(o.cta, CTA_DEFAULTS),
  };
}

function normaliseBlock(raw: unknown, defaults: OverlayBlock): OverlayBlock {
  const b = (raw ?? {}) as Record<string, unknown>;
  const num = (value: unknown, fallback: number, min: number, max: number) => {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    x: num(b.x, defaults.x, 0, SLIDE_WIDTH),
    y: num(b.y, defaults.y, 0, SLIDE_HEIGHT),
    width: num(b.width, defaults.width, 80, SLIDE_WIDTH),
    height: num(b.height, defaults.height, 40, SLIDE_HEIGHT),
    fontSize: num(b.fontSize, defaults.fontSize, 16, 240),
    fontWeight: num(b.fontWeight, defaults.fontWeight, 300, 900),
    align:
      b.align === "left" || b.align === "right" || b.align === "center"
        ? b.align
        : defaults.align,
    lineHeight: num(b.lineHeight, defaults.lineHeight, 0.8, 3),
    style: OVERLAY_STYLES.includes(b.style as OverlayStyle)
      ? (b.style as OverlayStyle)
      : null,
    strokeColor:
      typeof b.strokeColor === "string" && /^#[0-9a-f]{6}$/i.test(b.strokeColor)
        ? b.strokeColor
        : defaults.strokeColor,
    strokeWidth: num(b.strokeWidth, defaults.strokeWidth, 0, 50),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The inner span for one block.
 *
 * The pill styles use one inline span with `box-decoration-break: clone`, so
 * the background wraps each line separately with its own rounded corners.
 * That is the native TikTok look, and it is the reason this renders in a
 * browser rather than in an image library.
 *
 * `paint-order: stroke fill` is what keeps the outline outside the glyph
 * rather than eating into it; without it the text looks thinner and muddier at
 * thumbnail size.
 */
export function renderBlockInner(
  text: string,
  block: OverlayBlock,
  slideStyle: OverlayStyle,
): string {
  const safe = escapeHtml(text).replace(/\n/g, "<br/>");
  if (!safe) return "";
  const style = block.style ?? slideStyle;
  const size = block.fontSize;

  if (style === "pillWhite" || style === "pillBlack") {
    const padX = Math.round(size * 0.45);
    const padY = Math.round(size * 0.1);
    const radius = Math.round(size * 0.3);
    const bg = style === "pillWhite" ? "#fff" : "#000";
    const fg = style === "pillWhite" ? "#000" : "#fff";
    return `<span style="background:${bg};color:${fg};padding:${padY}px ${padX}px;border-radius:${radius}px;box-decoration-break:clone;-webkit-box-decoration-break:clone;">${safe}</span>`;
  }

  if (style === "stroke") {
    const stroke = Math.max(0, Math.round(size * (block.strokeWidth / 100)));
    return `<span style="color:#fff;-webkit-text-stroke:${stroke}px ${block.strokeColor};paint-order:stroke fill;text-shadow:0 4px 12px rgba(0,0,0,0.35);">${safe}</span>`;
  }

  return `<span style="color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.6);">${safe}</span>`;
}

/**
 * Geometry for one block, as a style object.
 *
 * The editor preview and the final capture both read this, so what the
 * operator drags into place is what the JPEG contains. Two implementations of
 * the same layout would drift apart the first time either was touched.
 */
export function blockLayout(block: OverlayBlock): Record<string, string | number> {
  const justify =
    block.align === "left"
      ? "flex-start"
      : block.align === "right"
        ? "flex-end"
        : "center";
  return {
    position: "absolute",
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    height: `${block.height}px`,
    transform: "translate(-50%,-50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: justify,
    fontSize: `${block.fontSize}px`,
    fontWeight: block.fontWeight,
    lineHeight: block.lineHeight,
    overflowWrap: "break-word",
    wordWrap: "break-word",
  };
}

/** The same geometry as a CSS declaration string, for the captured markup. */
export function blockBoxStyle(block: OverlayBlock): string {
  return Object.entries(blockLayout(block))
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
    .join(";");
}

/** The words to lay over one image, in one language. */
export interface SlideCopy {
  title: string;
  subtitle: string;
  cta?: string;
}

export interface BuildSlideHtmlInput {
  slide: SlideCopy;
  overlay: SlideOverlay;
  /** The background photograph, as a data URL. */
  backgroundDataUrl: string;
  /** The font file, as a base64 string with no data: prefix. */
  fontBase64: string;
}

export function buildSlideHtml(input: BuildSlideHtmlInput): string {
  const { overlay, slide } = input;

  const block = (text: string, b: OverlayBlock) =>
    text.trim()
      ? `<div style="${blockBoxStyle(b)}"><div style="width:100%;text-align:${b.align};">${renderBlockInner(text, b, overlay.style)}</div></div>`
      : "";

  return `<div style="
  width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;position:relative;overflow:hidden;
  margin:0;padding:0;box-sizing:border-box;
  font-family:'TikTok Sans','Segoe UI Emoji',sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;">
  <style>
    @font-face {
      font-family:'TikTok Sans';
      src:url(data:font/woff2;base64,${input.fontBase64}) format('woff2');
      font-weight:300 900;
      font-style:normal;
      font-display:block;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
  </style>
  <img src="${input.backgroundDataUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
  ${block(slide.title, overlay.title)}
  ${block(slide.subtitle, overlay.subtitle)}
  ${block(slide.cta ?? "", overlay.cta)}
</div>`;
}

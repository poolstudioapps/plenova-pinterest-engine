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

import { PILL, isPillStyle, pillSpanCss } from "@/lib/pill";

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

/*
 * Typography for the pill styles, which read like TikTok's own text tool
 * rather than like a poster: a semibold weight instead of the outlined
 * titles' 800, and enough line height for the background to breathe - at the
 * outlined style's 1.1 the boxes would sit tight against every ascender.
 */
const PILL_TYPE: Pick<OverlayBlock, "fontWeight" | "lineHeight"> = {
  fontWeight: 600,
  lineHeight: 1.28,
};

export function defaultOverlay(style: OverlayStyle = "stroke"): SlideOverlay {
  const pill = isPillStyle(style) ? PILL_TYPE : {};
  return {
    style,
    title: { ...TITLE_DEFAULTS, ...pill },
    subtitle: { ...SUBTITLE_DEFAULTS, ...pill },
    cta: { ...CTA_DEFAULTS, ...pill },
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
  /** The measured TikTok outline, for a pill style. See lib/pill.ts. */
  pill?: string | null,
): string {
  const safe = escapeHtml(text).replace(/\n/g, "<br/>");
  if (!safe) return "";
  const style = block.style ?? slideStyle;
  const size = block.fontSize;

  if (isPillStyle(style)) {
    const look = style === "pillWhite" ? PILL.white : PILL.black;
    if (pill) {
      // One continuous shape behind the words, the way TikTok draws it. The
      // svg shares the text container's coordinate space, which is the space
      // the outline was measured in.
      //
      // The xmlns is not optional. The capture renders this markup inside an
      // SVG foreignObject, which is parsed as XML: there, an <svg> with no
      // namespace inherits the XHTML one from its parent div, becomes an
      // unknown element, and draws nothing - the published image lost its
      // background while the on-screen preview, parsed as HTML, looked fine.
      return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;"><path d="${pill}" fill="${look.fill}"/></svg><span style="${pillSpanCss(size)}color:${look.ink};">${safe}</span>`;
    }
    // Not measured yet - first paint, or no browser. Separate boxes per line,
    // which is the best CSS alone can do, until the outline arrives.
    const padY = Math.round(size * PILL.padY);
    const radius = Math.round(size * PILL.radius);
    return `<span style="${pillSpanCss(size)}padding-top:${padY}px;padding-bottom:${padY}px;background:${look.fill};color:${look.ink};border-radius:${radius}px;">${safe}</span>`;
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

/**
 * TikTok Sans, split the way Google Fonts splits it.
 *
 * The app used to ship ONE file, and it was the `latin-ext` subset: Polish,
 * Czech and Vietnamese letters, the currency signs - and not a single a-z, not
 * one digit, no é, no ç, no ñ, no ü, no curly apostrophe. Every slide ever
 * composed was therefore drawn in the fallback font, letter by letter, while
 * the code believed it was TikTok Sans. `latin` is the subset that carries the
 * five languages this tool writes in; `latin-ext` stays for the rest.
 *
 * Each face declares its unicode-range, so the browser takes each character
 * from whichever file holds it - exactly as it does on fonts.googleapis.com.
 */
export const FONT_SUBSETS = [
  {
    key: "latin",
    file: "/fonts/TikTokSans-latin.woff2",
    range:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  },
  {
    key: "latinExt",
    file: "/fonts/TikTokSans-latin-ext.woff2",
    range:
      "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  },
] as const;

export type FontPayload = Record<(typeof FONT_SUBSETS)[number]["key"], string>;

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
  /** Each TikTok Sans subset, as base64 with no data: prefix. */
  fonts: FontPayload;
  /** Measured outlines for the blocks drawn as pills. */
  pills?: Partial<Record<"title" | "subtitle" | "cta", string | null>>;
}

export function buildSlideHtml(input: BuildSlideHtmlInput): string {
  const { overlay, slide } = input;

  const block = (text: string, b: OverlayBlock, pill?: string | null) =>
    text.trim()
      ? `<div style="${blockBoxStyle(b)}"><div style="position:relative;width:100%;text-align:${b.align};">${renderBlockInner(text, b, overlay.style, pill)}</div></div>`
      : "";

  return `<div style="
  width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;position:relative;overflow:hidden;
  margin:0;padding:0;box-sizing:border-box;
  font-family:'TikTok Sans','Segoe UI Emoji',sans-serif;
  -webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;">
  <style>
    ${FONT_SUBSETS.map(
      (f) => `@font-face {
      font-family:'TikTok Sans';
      src:url(data:font/woff2;base64,${input.fonts[f.key]}) format('woff2');
      font-weight:300 900;
      font-style:normal;
      font-display:block;
      unicode-range:${f.range};
    }`,
    ).join("\n")}
    * { margin:0; padding:0; box-sizing:border-box; }
  </style>
  <img src="${input.backgroundDataUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
  ${block(slide.title, overlay.title, input.pills?.title)}
  ${block(slide.subtitle, overlay.subtitle, input.pills?.subtitle)}
  ${block(slide.cta ?? "", overlay.cta, input.pills?.cta)}
</div>`;
}

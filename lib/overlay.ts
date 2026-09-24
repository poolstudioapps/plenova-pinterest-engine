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
  /**
   * The colour TikTok's palette would set: the letters for the outlined and
   * plain styles, the background for a pill - whose letters then turn white
   * or black, whichever reads on it. Null keeps the style's own colours.
   * Optional because every overlay stored before colours existed lacks it.
   */
  color?: string | null;
}

/**
 * How the photograph sits in the frame.
 *
 * `zoom` 1 fills the frame exactly as `object-fit: cover` does; above that the
 * picture is cropped in. `x` and `y` are the focal point, in percent of the
 * frame: the spot that stays put while zooming, and the one panning moves.
 * Keeping both in percent means 0 and 100 are always the picture's own edges
 * whatever its size, so no framing can ever show an empty strip.
 */
export interface PhotoFrame {
  zoom: number;
  x: number;
  y: number;
}

export const PHOTO_DEFAULTS: PhotoFrame = { zoom: 1, x: 50, y: 50 };
export const PHOTO_MAX_ZOOM = 4;

export interface SlideOverlay {
  style: OverlayStyle;
  title: OverlayBlock;
  subtitle: OverlayBlock;
  /** Renders only when the slide has CTA text, so every slide can carry one. */
  cta: OverlayBlock;
  /** Absent on overlays stored before framing existed: centred, uncropped. */
  photo?: PhotoFrame;
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
  color: null,
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
  color: null,
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
  color: null,
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
    photo: { ...PHOTO_DEFAULTS },
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
    photo: normalisePhoto(o.photo),
  };
}

function normalisePhoto(raw: unknown): PhotoFrame {
  const p = (raw ?? {}) as Record<string, unknown>;
  const num = (value: unknown, fallback: number, min: number, max: number) => {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    zoom: num(p.zoom, PHOTO_DEFAULTS.zoom, 1, PHOTO_MAX_ZOOM),
    x: num(p.x, PHOTO_DEFAULTS.x, 0, 100),
    y: num(p.y, PHOTO_DEFAULTS.y, 0, 100),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

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
      typeof b.strokeColor === "string" && HEX.test(b.strokeColor)
        ? b.strokeColor
        : defaults.strokeColor,
    strokeWidth: num(b.strokeWidth, defaults.strokeWidth, 0, 50),
    color: typeof b.color === "string" && HEX.test(b.color) ? b.color.toLowerCase() : null,
  };
}

/**
 * The text palette, after TikTok's own row of swatches, plus the Plenova
 * green. Any other colour stays possible through the custom picker; these are
 * the ones a TikTok viewer is used to seeing.
 */
export const TEXT_COLORS: { value: string; label: string }[] = [
  { value: "#ffffff", label: "Blanc" },
  { value: "#000000", label: "Noir" },
  { value: "#ea4040", label: "Rouge" },
  { value: "#ff933d", label: "Orange" },
  { value: "#f2cd46", label: "Jaune" },
  { value: "#78c25e", label: "Vert" },
  { value: "#77c8a6", label: "Menthe" },
  { value: "#3496f0", label: "Bleu" },
  { value: "#5856d5", label: "Violet" },
  { value: "#f5a3c7", label: "Rose" },
  { value: "#a3895b", label: "Brun" },
  { value: "#11481d", label: "Vert Plenova" },
];

/**
 * Black or white letters for a coloured pill, the way TikTok picks them: dark
 * on the pale swatches (white, yellow, pink), white on everything else.
 */
export function inkOn(hex: string): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.5 ? "#000000" : "#ffffff";
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

  const color = block.color ?? null;

  if (isPillStyle(style)) {
    // A chosen colour replaces the preset outright, opaque like TikTok's own
    // coloured backgrounds; the letters follow whatever reads on it.
    const look = color
      ? { fill: color, ink: inkOn(color) }
      : style === "pillWhite"
        ? PILL.white
        : PILL.black;
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
    return `<span style="color:${color ?? "#fff"};-webkit-text-stroke:${stroke}px ${block.strokeColor};paint-order:stroke fill;text-shadow:0 4px 12px rgba(0,0,0,0.35);">${safe}</span>`;
  }

  return `<span style="color:${color ?? "#fff"};text-shadow:0 2px 8px rgba(0,0,0,0.6);">${safe}</span>`;
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
  return toCss(blockLayout(block));
}

function toCss(style: Record<string, string | number>): string {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
    .join(";");
}

/**
 * How the photograph is drawn, for the editor, the previews and the capture
 * alike - the same rule as the blocks, one implementation.
 *
 * `object-position` pans across whatever `cover` cropped away, and the scale
 * zooms around the same point. Because both use the focal point, every value
 * from 0 to 100 keeps the picture filling the frame: 0 puts its left edge
 * flush with the frame's, 100 its right edge.
 */
export function photoLayout(frame: PhotoFrame | undefined): Record<string, string | number> {
  const f = frame ?? PHOTO_DEFAULTS;
  const origin = `${f.x}% ${f.y}%`;
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: origin,
    transformOrigin: origin,
    transform: f.zoom === 1 ? "none" : `scale(${f.zoom})`,
  };
}

export function photoCss(frame: PhotoFrame | undefined): string {
  return toCss(photoLayout(frame));
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
  <img src="${input.backgroundDataUrl}" style="${photoCss(overlay.photo)}" />
  ${block(slide.title, overlay.title, input.pills?.title)}
  ${block(slide.subtitle, overlay.subtitle, input.pills?.subtitle)}
  ${block(slide.cta ?? "", overlay.cta, input.pills?.cta)}
</div>`;
}

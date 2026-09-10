
/**
 * Slide composition.
 *
 * Ported in spirit from the carousel-studio renderer: the layout is plain
 * HTML and CSS, rendered by a real browser engine. That matters because the
 * two signature looks depend on CSS that no server-side HTML-to-image library
 * implements - `-webkit-text-stroke` with `paint-order`, and
 * `box-decoration-break: clone` for per-line pills.
 *
 * Rather than run headless Chromium on a serverless function, the operator's
 * own browser does the render. It is the same engine, so the output matches,
 * and there is nothing to install or keep warm.
 *
 * Everything the markup references must be inlined as a data URL: the capture
 * happens inside an SVG foreignObject, which cannot fetch external resources.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

export type OverlayStyle = "stroke" | "pill" | "none";

export interface OverlayOptions {
  style: OverlayStyle;
  /** Vertical placement of the text block. */
  position: "top" | "center" | "bottom";
  /** Outline colour for the stroke style. Plenova green by default. */
  strokeColor?: string;
}

export const DEFAULT_OVERLAY: OverlayOptions = {
  style: "stroke",
  position: "bottom",
  strokeColor: "#11481D",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders one text line.
 *
 * `paint-order: stroke fill` is what keeps the outline outside the glyph
 * rather than eating into it; without it the text looks thinner and muddier at
 * thumbnail size.
 */
function renderText(
  text: string,
  fontSize: number,
  weight: number,
  options: OverlayOptions,
): string {
  const safe = escapeHtml(text);
  if (!safe) return "";

  if (options.style === "pill") {
    const padX = Math.round(fontSize * 0.4);
    const padY = Math.round(fontSize * 0.12);
    const radius = Math.round(fontSize * 0.28);
    return `<span style="background:#fff;color:#000;padding:${padY}px ${padX}px;border-radius:${radius}px;box-decoration-break:clone;-webkit-box-decoration-break:clone;font-weight:${weight};font-size:${fontSize}px;">${safe}</span>`;
  }

  if (options.style === "stroke") {
    const stroke = Math.max(3, Math.round(fontSize * 0.14));
    const color = options.strokeColor ?? DEFAULT_OVERLAY.strokeColor;
    return `<span style="color:#fff;font-weight:${weight};font-size:${fontSize}px;-webkit-text-stroke:${stroke}px ${color};paint-order:stroke fill;text-shadow:0 4px 14px rgba(0,0,0,0.35);">${safe}</span>`;
  }

  return `<span style="color:#fff;font-weight:${weight};font-size:${fontSize}px;text-shadow:0 2px 10px rgba(0,0,0,0.65);">${safe}</span>`;
}

/** The words to lay over one image. */
export interface SlideCopy {
  title: string;
  subtitle: string;
}

export interface BuildSlideHtmlInput {
  slide: SlideCopy;
  /** The background photograph, as a data URL. */
  backgroundDataUrl: string;
  /** The font file, as a base64 string (no data: prefix). */
  fontBase64: string;
  options?: Partial<OverlayOptions>;
}

export function buildSlideHtml(input: BuildSlideHtmlInput): string {
  const options: OverlayOptions = { ...DEFAULT_OVERLAY, ...input.options };
  const { title, subtitle } = input.slide;

  // Long titles have to shrink or they wrap into an unreadable block.
  const titleSize = title.length > 34 ? 74 : title.length > 22 ? 88 : 104;
  const subtitleSize = 40;

  const justify =
    options.position === "top"
      ? "flex-start"
      : options.position === "bottom"
        ? "flex-end"
        : "center";

  // A scrim only where the text sits, so the photograph stays readable.
  const scrim =
    options.style === "pill"
      ? "none"
      : options.position === "top"
        ? "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 55%)"
        : options.position === "bottom"
          ? "linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 55%)"
          : "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%)";

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
  <div style="position:absolute;inset:0;background:${scrim};"></div>
  <div style="
    position:absolute;inset:0;display:flex;flex-direction:column;
    justify-content:${justify};align-items:center;
    padding:96px 84px;text-align:center;gap:28px;">
    <div style="line-height:1.08;">${renderText(title, titleSize, 800, options)}</div>
    ${subtitle ? `<div style="line-height:1.32;max-width:88%;">${renderText(subtitle, subtitleSize, 500, options)}</div>` : ""}
  </div>
</div>`;
}

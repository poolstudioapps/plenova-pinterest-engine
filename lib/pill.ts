/**
 * TikTok's text background: one continuous shape around every line.
 *
 * CSS can only give each wrapped line its own separate box
 * (`box-decoration-break: clone`), four rounded corners each, with a seam
 * between lines and double darkness where two translucent boxes overlap.
 * TikTok draws something else: a single outline that hugs each line's width,
 * rounded OUTWARDS on its outer corners and rounded INWARDS - a concave fillet
 * - wherever a shorter line meets a longer one. That shape has to be computed,
 * so it is: from the real width of every rendered line.
 */

import type { OverlayBlock, OverlayStyle } from "@/lib/overlay";

export interface PillLine {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Lines whose edges fall this close together are squared up to the wider one.
 *
 * Two lines a few pixels apart would otherwise produce a step too small to
 * round - a notch rather than a curve. TikTok evens them out the same way.
 */
function snapEdges(lines: PillLine[], tolerance: number): PillLine[] {
  const out = lines.map((l) => ({ ...l }));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i + 1 < out.length; i++) {
      const a = out[i]!;
      const b = out[i + 1]!;
      if (Math.abs(a.right - b.right) < tolerance) {
        const r = Math.max(a.right, b.right);
        a.right = r;
        b.right = r;
      }
      if (Math.abs(a.left - b.left) < tolerance) {
        const l = Math.min(a.left, b.left);
        a.left = l;
        b.left = l;
      }
    }
  }
  return out;
}

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * The outline as an SVG path, traced clockwise from the first line's top-left.
 *
 * Down the right-hand side, then back up the left. At every step between two
 * lines there are two corners: the one on the wider line turns outwards
 * (convex, sweep 1) and the one on the narrower line turns inwards (concave,
 * sweep 0). Each radius is capped at half the step it rounds and half a line
 * height, so neighbouring curves can never cross.
 */
export function pillPath(input: PillLine[], radius: number): string {
  if (input.length === 0) return "";
  const lines = snapEdges(input, radius);
  const n = lines.length;
  const first = lines[0]!;
  const last = lines[n - 1]!;

  const lineHeight = (l: PillLine) => l.bottom - l.top;
  const cap = (step: number, l: PillLine) =>
    Math.max(0, Math.min(radius, step / 2, lineHeight(l) / 2));

  const rTopL = cap(Infinity, first);
  const rTopR = cap(Infinity, first);
  const d: string[] = [];

  // Top edge of the first line.
  d.push(`M${f(first.left + rTopL)} ${f(first.top)}`);
  d.push(`H${f(first.right - rTopR)}`);
  d.push(`A${f(rTopR)} ${f(rTopR)} 0 0 1 ${f(first.right)} ${f(first.top + rTopR)}`);

  // Right side, top to bottom.
  for (let i = 0; i < n; i++) {
    const cur = lines[i]!;
    const next = lines[i + 1];
    if (!next) {
      const r = cap(Infinity, cur);
      d.push(`V${f(cur.bottom - r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 1 ${f(cur.right - r)} ${f(cur.bottom)}`);
      break;
    }
    const y = cur.bottom;
    if (next.right > cur.right) {
      // The next line reaches further right: turn in, then out.
      const r = Math.min(cap(next.right - cur.right, cur), cap(Infinity, next));
      d.push(`V${f(y - r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 0 ${f(cur.right + r)} ${f(y)}`);
      d.push(`H${f(next.right - r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 1 ${f(next.right)} ${f(y + r)}`);
    } else if (next.right < cur.right) {
      // The next line is shorter: turn out, then in.
      const r = Math.min(cap(cur.right - next.right, cur), cap(Infinity, next));
      d.push(`V${f(y - r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 1 ${f(cur.right - r)} ${f(y)}`);
      d.push(`H${f(next.right + r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 0 ${f(next.right)} ${f(y + r)}`);
    }
    // Equal edges: carry straight on down.
  }

  // Bottom edge of the last line.
  const rBotL = cap(Infinity, last);
  d.push(`H${f(last.left + rBotL)}`);
  d.push(`A${f(rBotL)} ${f(rBotL)} 0 0 1 ${f(last.left)} ${f(last.bottom - rBotL)}`);

  // Left side, bottom to top.
  for (let i = n - 1; i >= 0; i--) {
    const cur = lines[i]!;
    const prev = lines[i - 1];
    if (!prev) {
      d.push(`V${f(cur.top + rTopL)}`);
      d.push(`A${f(rTopL)} ${f(rTopL)} 0 0 1 ${f(cur.left + rTopL)} ${f(cur.top)}`);
      break;
    }
    const y = cur.top;
    if (prev.left < cur.left) {
      // The line above reaches further left: turn in, then out.
      const r = Math.min(cap(cur.left - prev.left, cur), cap(Infinity, prev));
      d.push(`V${f(y + r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 0 ${f(cur.left - r)} ${f(y)}`);
      d.push(`H${f(prev.left + r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 1 ${f(prev.left)} ${f(y - r)}`);
    } else if (prev.left > cur.left) {
      // The line above is shorter: turn out, then in.
      const r = Math.min(cap(prev.left - cur.left, cur), cap(Infinity, prev));
      d.push(`V${f(y + r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 1 ${f(cur.left + r)} ${f(y)}`);
      d.push(`H${f(prev.left - r)}`);
      d.push(`A${f(r)} ${f(r)} 0 0 0 ${f(prev.left)} ${f(y - r)}`);
    }
  }

  d.push("Z");
  return d.join(" ");
}

/**
 * The look, in one place, as fractions of the font size so it scales with it.
 *
 * Read off TikTok's own text tool: the two "text with background" states for
 * white text - white text on a translucent black box, and black text on an
 * opaque white one.
 */
export const PILL = {
  /** Horizontal breathing room inside each line. */
  padX: 0.28,
  /** Extra height above the first line and below the last. */
  padY: 0.1,
  /** Corner radius, outward and inward alike. */
  radius: 0.3,
  black: { fill: "rgba(0,0,0,0.62)", ink: "#ffffff" },
  white: { fill: "#ffffff", ink: "#000000" },
} as const;

export type PillStyle = "pillWhite" | "pillBlack";

export function isPillStyle(style: string | null | undefined): style is PillStyle {
  return style === "pillWhite" || style === "pillBlack";
}

/** What a pill's text needs to be measured: its words and its typography. */
export interface PillMeasureInput {
  text: string;
  width: number;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  align: "left" | "center" | "right";
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

/** The span every renderer uses for a pill's words - measured and drawn alike. */
export function pillSpanCss(fontSize: number): string {
  const padX = Math.round(fontSize * PILL.padX);
  return `position:relative;padding:0 ${padX}px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`;
}

/**
 * Browser only: lays the words out exactly as the slide will, and traces them.
 *
 * The text goes into an invisible box of the block's own width and typography,
 * so the line breaks are the ones the slide will have - measured, never
 * guessed. Each line's horizontal extent comes from the browser's own rects;
 * the vertical position comes from the line box, so consecutive lines meet
 * with no seam and no overlap however the font's metrics fall.
 *
 * Returns the path in the coordinate space of the block's text container, or
 * null where there is nothing to measure (server rendering, empty text).
 */
export function measurePill(input: PillMeasureInput): string | null {
  if (typeof document === "undefined" || !input.text.trim()) return null;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position:absolute",
    "left:-100000px",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    `width:${input.width}px`,
    "font-family:'TikTok Sans','Segoe UI Emoji',sans-serif",
    `font-size:${input.fontSize}px`,
    `font-weight:${input.fontWeight}`,
    `line-height:${input.lineHeight}`,
    `text-align:${input.align}`,
    "overflow-wrap:break-word",
    "word-wrap:break-word",
    "-webkit-font-smoothing:antialiased",
  ].join(";");

  const span = document.createElement("span");
  span.style.cssText = pillSpanCss(input.fontSize);
  span.innerHTML = escapeText(input.text);
  host.appendChild(span);
  document.body.appendChild(host);

  try {
    const origin = host.getBoundingClientRect();
    const lineBox = input.fontSize * input.lineHeight;
    // A line that is only a line break reports a zero-width rect; it has no
    // words, so it gets no box.
    const rects = Array.from(span.getClientRects()).filter((r) => r.width > 0.5);
    if (rects.length === 0) return null;

    const lines: PillLine[] = rects.map((r) => {
      const centre = (r.top + r.bottom) / 2 - origin.top;
      return {
        left: r.left - origin.left,
        right: r.right - origin.left,
        top: centre - lineBox / 2,
        bottom: centre + lineBox / 2,
      };
    });

    // Consecutive lines meet exactly, splitting any gap or overlap evenly.
    for (let i = 0; i + 1 < lines.length; i++) {
      const a = lines[i]!;
      const b = lines[i + 1]!;
      const seam = (a.bottom + b.top) / 2;
      a.bottom = seam;
      b.top = seam;
    }
    const padY = input.fontSize * PILL.padY;
    lines[0]!.top -= padY;
    lines[lines.length - 1]!.bottom += padY;

    return pillPath(lines, input.fontSize * PILL.radius);
  } finally {
    host.remove();
  }
}

/** A block's measuring input when it wears a pill, or null when it does not. */
export function pillInput(
  text: string,
  block: OverlayBlock,
  slideStyle: OverlayStyle,
): PillMeasureInput | null {
  if (!text.trim() || !isPillStyle(block.style ?? slideStyle)) return null;
  return {
    text,
    width: block.width,
    fontSize: block.fontSize,
    fontWeight: block.fontWeight,
    lineHeight: block.lineHeight,
    align: block.align,
  };
}

/**
 * Measures several pills, once the font they are drawn in has arrived.
 *
 * Measuring before TikTok Sans loads would size every line to the fallback
 * font, and the shape would then sit visibly wider or narrower than the words.
 */
export async function measurePills(
  items: (PillMeasureInput | null)[],
): Promise<(string | null)[]> {
  if (typeof document === "undefined") return items.map(() => null);
  await Promise.all(
    items.map((item) =>
      item
        ? document.fonts
            .load(`${item.fontWeight} ${item.fontSize}px 'TikTok Sans'`, item.text)
            .catch(() => [])
        : null,
    ),
  );
  return items.map((item) => (item ? measurePill(item) : null));
}

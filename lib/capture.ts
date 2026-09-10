"use client";

import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  buildSlideHtml,
  type OverlayOptions,
} from "@/lib/overlay";
import type { CarouselSlide } from "@/lib/types";

/**
 * Browser-side slide capture.
 *
 * The composition is rendered inside an SVG `foreignObject` and drawn to a
 * canvas. That path uses the browser's real layout and paint engine, so the
 * CSS the design depends on - text stroke with paint-order, per-line pill
 * backgrounds - renders exactly as it does on screen. No headless browser, and
 * nothing that has to run on the server.
 *
 * The one hard rule of foreignObject: it cannot fetch anything. The font and
 * the background photograph must both already be data URLs by the time the SVG
 * is built, or they silently render as nothing.
 */

let fontCache: string | null = null;

/** Fetches the font once per session and keeps the base64 around. */
export async function loadFont(): Promise<string> {
  if (fontCache) return fontCache;
  const res = await fetch("/fonts/TikTokSans.woff2");
  if (!res.ok) throw new Error("Could not load the TikTok Sans font file.");
  fontCache = bufferToBase64(await res.arrayBuffer());
  return fontCache;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked so a large buffer cannot blow the argument limit of fromCharCode.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Pulls an image through our own origin and returns it as a data URL. */
async function loadBackground(mediaId: string): Promise<string> {
  const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/raw`);
  if (!res.ok) throw new Error("Could not load the slide image.");
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the slide image."));
    reader.readAsDataURL(blob);
  });
}

/** Renders one slide and returns it as a JPEG data URL. */
export async function captureSlide(
  slide: CarouselSlide,
  options: Partial<OverlayOptions> = {},
): Promise<string> {
  if (!slide.mediaId) throw new Error("This slide has no image to compose on.");

  const [fontBase64, backgroundDataUrl] = await Promise.all([
    loadFont(),
    loadBackground(slide.mediaId),
  ]);

  const html = buildSlideHtml({
    slide,
    backgroundDataUrl,
    fontBase64,
    options,
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml">${html}</div>
</foreignObject>
</svg>`;

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = SLIDE_WIDTH;
  canvas.height = SLIDE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");

  // JPEG has no alpha, so paint a base colour rather than get black fringing.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  ctx.drawImage(image, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

  return canvas.toDataURL("image/jpeg", 0.92);
}

export interface CapturedSlide {
  index: number;
  dataUrl: string;
}

/** Renders every slide of a carousel, reporting progress as it goes. */
export async function captureSlides(
  slides: CarouselSlide[],
  options: Partial<OverlayOptions> = {},
  onProgress?: (done: number, total: number) => void,
): Promise<CapturedSlide[]> {
  const out: CapturedSlide[] = [];
  for (const [index, slide] of slides.entries()) {
    out.push({ index, dataUrl: await captureSlide(slide, options) });
    onProgress?.(index + 1, slides.length);
  }
  return out;
}

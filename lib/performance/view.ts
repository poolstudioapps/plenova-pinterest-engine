/**
 * What the Performances page remembers from one visit to the next: the chart
 * drawn under each group of tiles and the store picked in the AppsFlyer
 * section. In a cookie rather than in the browser's storage, so the server
 * draws the page as it was left - no default chart flashing first.
 *
 * No server import here: the page reads it, the browser writes it.
 */

import type { Os } from "@/lib/performance/compute";

export const VIEW_COOKIE = "perf_view";

export interface PerfView {
  /** Group of tiles -> the id of the tile whose chart is shown. */
  charts: Record<string, string>;
  os: Os;
}

export const DEFAULT_VIEW: PerfView = { charts: {}, os: "all" };

/** A cookie from a browser is input: anything unexpected falls back to the defaults. */
export function parseView(raw: string | undefined): PerfView {
  if (!raw) return DEFAULT_VIEW;
  try {
    // Written encoded; read back decoded or not depending on who parsed it.
    const text = raw.startsWith("%") ? decodeURIComponent(raw) : raw;
    const v = JSON.parse(text) as { charts?: unknown; os?: unknown };
    const charts: Record<string, string> = {};
    if (v.charts && typeof v.charts === "object") {
      for (const [group, id] of Object.entries(v.charts).slice(0, 12)) {
        if (/^[a-z]{1,16}$/.test(group) && typeof id === "string" && /^[A-Za-z0-9]{1,24}$/.test(id))
          charts[group] = id;
      }
    }
    const os = v.os === "ios" || v.os === "android" ? v.os : "all";
    return { charts, os };
  } catch {
    return DEFAULT_VIEW;
  }
}

/** Kept a year, sent to the Performances page only. */
export function saveView(view: PerfView): void {
  const value = encodeURIComponent(JSON.stringify(view));
  document.cookie = `${VIEW_COOKIE}=${value}; path=/performances; max-age=31536000; samesite=lax`;
}

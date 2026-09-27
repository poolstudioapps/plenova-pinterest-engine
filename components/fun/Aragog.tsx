"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAragogEnabled } from "./aragog-pref";
import type { Start } from "./spider";

/**
 * Where Aragog lives - the pages of the menu, not the editor, the login or a
 * detail page - and how it shows up on each: in a web in the corner of a
 * card, hanging from a thread under one, or coming out of its hole.
 */
const PAGES: Record<string, Start> = {
  "/performances": "web",
  "/": "thread",
  "/versus": "lair",
  "/carousels": "web",
  "/hooks": "thread",
  "/spy": "lair",
  "/tiktok": "web",
  "/generate": "thread",
  "/library": "lair",
  "/queue": "web",
  "/pinterest": "thread",
  "/media": "lair",
};

export function Aragog() {
  const pathname = usePathname();
  const start = PAGES[pathname];
  // The switch in the menu (components/layout/Sidebar.tsx).
  const enabled = useAragogEnabled();

  useEffect(() => {
    if (!start || !enabled) return;
    // A mouse only (it follows the pointer), and not for reduced motion.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    // Once the page has settled in (its cards are where they will stay),
    // and only the code of the spider is loaded, on demand.
    const timer = window.setTimeout(() => {
      void import("./spider").then(({ startAragog }) => {
        if (!cancelled) stop = startAragog(start);
      });
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop?.();
    };
  }, [start, pathname, enabled]);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { PottedPlant } from "@/components/plants/PottedPlant";
import { cn } from "@/lib/utils";

/**
 * The 3D monstera, sized by its box.
 *
 * three.js is fetched only when one of these is on screen - it is a separate
 * chunk, imported from the effect - so no other page pays for it. Where WebGL
 * is unavailable the drawn pot stands in, and a reader who asked for reduced
 * motion gets the plant drawn once and still.
 */
export function Plant3D({
  className,
  floating = 6,
}: {
  className?: string;
  /** How many small leaves drift around the plant. */
  floating?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("@/components/plants/monstera-scene")
      .then(({ mountMonstera }) => {
        if (cancelled) return;
        try {
          dispose = mountMonstera(el, { floating, reducedMotion });
        } catch {
          setFallback(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [floating]);

  return (
    <div ref={host} aria-hidden className={cn("relative", className)}>
      {fallback ? <PottedPlant className="absolute inset-0 m-auto h-4/5 w-4/5" /> : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { OverlayBlock, OverlayStyle } from "@/lib/overlay";
import { measurePills, pillInput } from "@/lib/pill";

/**
 * The measured TikTok outlines for a slide's blocks, in order.
 *
 * Re-measured only when something that changes the line breaks changes - the
 * words, the width, the size, the weight, the line height, the alignment.
 * Dragging a block moves it without touching any of those, so a drag never
 * triggers a measurement; resizing it does, which is exactly when the lines
 * rewrap.
 */
export function usePillPaths(
  items: { text: string; block: OverlayBlock; style: OverlayStyle }[],
): (string | null)[] {
  const inputs = items.map(({ text, block, style }) => pillInput(text, block, style));
  const key = JSON.stringify(inputs);

  const [paths, setPaths] = useState<(string | null)[]>(() => inputs.map(() => null));

  useEffect(() => {
    let cancelled = false;
    void measurePills(JSON.parse(key) as typeof inputs).then((measured) => {
      if (!cancelled) setPaths(measured);
    });
    return () => {
      cancelled = true;
    };
    // `key` is the whole dependency: it is the serialised measuring input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return paths;
}

"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/** The item a group of tabs, segments or links treats as the current one. */
const CURRENT =
  '[aria-current="page"],[aria-selected="true"],[aria-pressed="true"],[aria-checked="true"],[data-current="true"]';

type Box = { x: number; y: number; w: number; h: number };

/**
 * Where an item sits in its group, from the layout alone.
 *
 * Offsets rather than getBoundingClientRect: the bounding box includes CSS
 * transforms, so an item measured while it is still springing back from its
 * press (scale 0.97), or a group measured inside a dialog that is still
 * growing in, came out a few per cent small - and stayed so, since nothing
 * resizes when a transform ends. Offsets ignore transforms, and scrolling too,
 * which is right for a highlight that scrolls with the items it sits under.
 *
 * Null for an item with no size: a group that is hidden has nothing to show.
 */
function layoutBox(item: HTMLElement, group: HTMLElement): Box | null {
  const w = item.offsetWidth;
  const h = item.offsetHeight;
  if (w === 0 && h === 0) return null;
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = item;
  while (node && node !== group) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  // The group is not the items' positioning parent (it must be `relative`).
  if (node !== group) return null;
  return { x, y, w, h };
}

/**
 * True for the moment a list first appears, then false: for entrance
 * animations that should greet the page, not replay on every keystroke of a
 * search or every filter change.
 */
export function useArrival(ms = 700): boolean {
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setArriving(false), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return arriving;
}

/**
 * A highlight that slides from the previous choice to the new one instead of
 * blinking from one to the other: the eye follows it, so a change of tab,
 * period or page reads as a move rather than a swap.
 *
 * Put the ref on the group (it must be `relative`), render <Indicator> as its
 * first child, and give the items `relative` so they sit above it. The items
 * keep their own "current" styling until the indicator has measured itself,
 * so nothing is missing on the first paint or without JavaScript; the group
 * then carries `data-indicator="ready"` and the current item can drop its own
 * background (`group-data-[indicator=ready]:...`).
 *
 * `watch` is whatever says which item is current; the group is measured again
 * when it changes, when the group or any of its items resizes, and once the
 * web fonts have arrived (they change every label's width).
 */
export function useIndicator<T extends HTMLElement>(watch: unknown) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<Box | null>(null);
  // No slide on the first placement - it would fly in from the corner.
  const [moving, setMoving] = useState(false);

  // Measured before paint, so the highlight is never a frame behind the tab.
  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const current = group.querySelector<HTMLElement>(CURRENT);
      const next = current ? layoutBox(current, group) : null;
      setBox((prev) =>
        prev === next ||
        (prev && next && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h)
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    for (const item of group.querySelectorAll<HTMLElement>(
      '[role="tab"],[role="radio"],a,button',
    )) {
      observer.observe(item);
    }
    void document.fonts?.ready.then(measure);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [watch]);

  useEffect(() => {
    if (!box || moving) return;
    const timer = window.setTimeout(() => setMoving(true), 50);
    return () => window.clearTimeout(timer);
  }, [box, moving]);

  return { ref, box, moving, ready: box !== null };
}

export function Indicator({
  box,
  moving,
  className,
}: {
  box: Box | null;
  moving: boolean;
  className?: string;
}) {
  if (!box) return null;
  const style: CSSProperties = {
    width: box.w,
    height: box.h,
    transform: `translate(${box.x}px, ${box.y}px)`,
  };
  return (
    <span
      aria-hidden
      data-moving={moving || undefined}
      style={style}
      className={cn("indicator pointer-events-none absolute top-0 left-0", className)}
    />
  );
}

/**
 * A group of tabs or segments whose highlight slides (see useIndicator).
 * `watch` must change whenever the current item does - or its width does,
 * like a count in its label.
 */
export function Sliding({
  watch,
  indicatorClassName,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  watch: unknown;
  /** How the highlight looks: a pill, an underline... */
  indicatorClassName: string;
}) {
  const { ref, box, moving, ready } = useIndicator<HTMLDivElement>(watch);
  return (
    <div
      ref={ref}
      {...rest}
      data-indicator={ready ? "ready" : undefined}
      className={cn("group/slide relative", className)}
    >
      <Indicator box={box} moving={moving} className={indicatorClassName} />
      {children}
    </div>
  );
}

/**
 * For the current item of a Sliding group: its own highlight (background,
 * shadow, underline) steps aside once the sliding one has taken over.
 */
export const HANDED_OVER =
  "group-data-[indicator=ready]/slide:border-transparent group-data-[indicator=ready]/slide:bg-transparent group-data-[indicator=ready]/slide:shadow-none";

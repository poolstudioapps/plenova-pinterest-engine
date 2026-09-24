"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** How far a press must travel before it becomes a drag, in pixels. */
const ACTIVATE = 8;
/** How far the dragged item may lean past the edges of its list. */
const SLACK = 12;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  scrollX: number;
  scrollY: number;
  /** The item's resting box when it was grabbed, in list coordinates. */
  origin: Box;
  /** The list's inner size, which the item is kept inside. */
  bounds: { width: number; height: number };
  started: boolean;
}

/**
 * An item's resting place in its list: layout only, whatever transform it
 * wears. Everything the drag computes is measured this way.
 *
 * The first version measured `getBoundingClientRect()`, which includes the
 * transform - and an item that had been dragged or slid aside once kept a CSS
 * transition, so on the next drag the rect reported where the item was
 * EASING FROM, not where it had been put. Every move then corrected against a
 * stale position, the error grew with each event, and the item ran away from
 * the pointer - measured at 180 px off after a few moves on the second drag.
 */
function restBox(el: HTMLElement): Box {
  return {
    left: el.offsetLeft,
    top: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Clears an item's transition once its own transform has finished easing. */
function settleWhenDone(el: HTMLElement) {
  el.ontransitionend = (event) => {
    if (event.target !== el || event.propertyName !== "transform") return;
    el.style.transition = "";
    el.ontransitionend = null;
  };
}

/**
 * A grid you reorder by dragging.
 *
 * Pointer events rather than the HTML5 drag-and-drop API: that API does not
 * work on touch screens, gives no control over what the dragged item looks
 * like, and cannot animate the other items out of the way. Here the grabbed
 * item follows the pointer - held inside its own grid, never loose across the
 * page - the others slide aside to show where it will land (a FLIP animation),
 * and nothing is committed until release.
 *
 * An item takes a slot when its CENTRE passes over another item, not the
 * moment the pointer touches one: grabbed by its edge, a thumbnail used to
 * swap with its neighbour after a few pixels.
 *
 * Keyboard: focus an item and use the arrow keys to move it one place.
 *
 * `onReorder` receives the new order of ids once, on drop. A press that never
 * travels further than a few pixels is left alone, so a click on the item - to
 * open it, to delete it - still works.
 */
export function SortableGrid<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
  itemLabel,
  disabled,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, state: { dragging: boolean; index: number }) => ReactNode;
  className?: string;
  /** Spoken name for an item, e.g. "Capture 3 sur 8". */
  itemLabel?: (item: T, index: number, total: number) => string;
  disabled?: boolean;
}) {
  const [order, setOrderState] = useState<string[] | null>(null);
  /*
   * The order as of this very instant. Handlers read this rather than the
   * `order` state they closed over: a release can arrive before React has
   * re-rendered from the last move, and a handler reading the state would
   * commit the order from one step earlier - the item landed a slot short.
   */
  const orderRef = useRef<string[] | null>(null);
  const setOrder = (next: string[] | null) => {
    orderRef.current = next;
    setOrderState(next);
  };
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const drag = useRef<Drag | null>(null);
  /** Removes the window listeners of the gesture in progress. */
  const detach = useRef<(() => void) | null>(null);
  /** Positions just before a reorder, for the FLIP animation. */
  const before = useRef<Map<string, DOMRect> | null>(null);

  const baseIds = items.map(getId);
  const ids = order ?? baseIds;
  const byId = new Map(items.map((item) => [getId(item), item]));

  function snapshot() {
    const map = new Map<string, DOMRect>();
    for (const id of ids) {
      const el = els.current.get(id);
      if (el) map.set(id, el.getBoundingClientRect());
    }
    return map;
  }

  function move(from: number, to: number, list: string[]) {
    const next = [...list];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked!);
    return next;
  }

  /**
   * Where the dragged item is drawn, in list coordinates: its box at the
   * press, moved exactly as far as the pointer, and kept inside the list. The
   * page scrolling under a still pointer counts as movement too.
   */
  function drawnAt(d: Drag): { left: number; top: number } {
    const dx = d.x - d.startX + (window.scrollX - d.scrollX);
    const dy = d.y - d.startY + (window.scrollY - d.scrollY);
    return {
      left: clamp(d.origin.left + dx, -SLACK, d.bounds.width - d.origin.width + SLACK),
      top: clamp(d.origin.top + dy, -SLACK, d.bounds.height - d.origin.height + SLACK),
    };
  }

  /** Draws the dragged item where it belongs, from wherever its slot is now. */
  function pin(d: Drag) {
    const el = els.current.get(d.id);
    if (!el) return;
    const at = drawnAt(d);
    const rest = restBox(el);
    el.style.transition = "none";
    el.style.transform = `translate3d(${at.left - rest.left}px, ${at.top - rest.top}px, 0) scale(1.03)`;
  }

  /**
   * The order the list would have if the item were dropped now, or null if
   * that is where it already sits: it takes the slot of the item its centre
   * is over. Stable by construction - after a swap the centre lies in the
   * dragged item's own new slot, which is skipped, so a still pointer never
   * makes two items trade places back and forth.
   */
  function orderAt(d: Drag, list: string[]): string[] | null {
    const at = drawnAt(d);
    const cx = at.left + d.origin.width / 2;
    const cy = at.top + d.origin.height / 2;
    let target: string | null = null;
    for (const id of list) {
      if (id === d.id) continue;
      const el = els.current.get(id);
      if (!el) continue;
      const r = restBox(el);
      if (cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height) {
        target = id;
        break;
      }
    }
    if (!target) return null;
    const from = list.indexOf(d.id);
    const to = list.indexOf(target);
    return from < 0 || from === to ? null : move(from, to, list);
  }

  // After every render during a drag: keep the dragged item under the pointer
  // from its new slot, and slide the others from where they were drawn to
  // where they now rest.
  useLayoutEffect(() => {
    const d = drag.current;
    if (d?.started) pin(d);
    const prev = before.current;
    if (!prev) return;
    before.current = null;
    for (const [id, old] of prev) {
      if (id === d?.id) continue;
      const el = els.current.get(id);
      if (!el) continue;
      // Measured bare, so an item still easing from the last swap starts
      // this one from where it truly rests.
      el.style.transition = "none";
      el.style.transform = "";
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (!dx && !dy) continue;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // Read a layout property so the browser applies the jump before the
      // transition back starts.
      void el.offsetWidth;
      el.style.transition = `transform 180ms ${EASE}`;
      el.style.transform = "";
      settleWhenDone(el);
    }
  });

  function onPointerDown(e: React.PointerEvent<HTMLElement>, id: string) {
    if (disabled || e.button !== 0 || !e.isPrimary) return;
    // Controls inside an item (delete, open) keep their own click.
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [data-no-drag]")) {
      return;
    }
    const el = els.current.get(id);
    const list = listRef.current;
    if (!el || !list) return;
    // A gesture whose release never arrived - the pointer let go outside the
    // window - is closed before a new one starts, never left listening.
    handlers.current.finish(null, false);

    // Taken from where the item is DRAWN, which is its resting place unless
    // it is still gliding in from the last drop - grabbed mid-glide, it
    // carries on from under the pointer instead of jumping to its slot.
    const drawn = el.getBoundingClientRect();
    const frame = list.getBoundingClientRect();
    const rest = restBox(el);
    drag.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      origin: {
        left: drawn.left + drawn.width / 2 - frame.left - list.clientLeft - rest.width / 2,
        top: drawn.top + drawn.height / 2 - frame.top - list.clientTop - rest.height / 2,
        width: rest.width,
        height: rest.height,
      },
      bounds: { width: list.clientWidth, height: list.clientHeight },
      started: false,
    };
    /*
     * Listen on the window, not through pointer capture on the item.
     *
     * Reordering makes React move the item's DOM node, and a node that is
     * moved loses its pointer capture - measured: the capture was lost on the
     * very first reorder, and the rest of the gesture went elsewhere. Window
     * listeners do not care which node the pointer is over or where it moved.
     */
    const onMove = (ev: PointerEvent) => handlers.current.move(ev);
    const onUp = (ev: PointerEvent) => handlers.current.finish(ev, true);
    const onCancel = (ev: PointerEvent) => handlers.current.finish(ev, false);
    const onScroll = () => {
      const d = drag.current;
      if (d?.started) pin(d);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("scroll", onScroll, { passive: true });
    detach.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("scroll", onScroll);
      detach.current = null;
    };
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;

    if (!d.started) {
      if (Math.hypot(d.x - d.startX, d.y - d.startY) < ACTIVATE) return;
      d.started = true;
      setDraggingId(d.id);
      // No early return: a quick flick may send only this one move before
      // the release, and it must still land where it was aimed.
    }

    pin(d);
    const next = orderAt(d, orderRef.current ?? baseIds);
    if (next) {
      before.current = snapshot();
      setOrder(next);
    }
  }

  function finish(e: PointerEvent | null, commit: boolean) {
    const d = drag.current;
    if (!d || (e && e.pointerId !== d.pointerId)) return;
    drag.current = null;
    detach.current?.();

    const el = els.current.get(d.id);
    if (el) {
      // Glide from where it is drawn into its slot, then drop the transition
      // so nothing carries it into the next gesture.
      el.style.transition = `transform 160ms ${EASE}`;
      el.style.transform = "";
      settleWhenDone(el);
    }

    /*
     * The release does NOT re-aim. The last move already placed the item
     * where it is drawn, and orderRef holds that order. The one case to settle
     * here is a quick flick with no move event between press and release:
     * nothing has been reordered, the layout is the starting one, and aiming
     * against it is safe.
     */
    let finalOrder = orderRef.current ?? baseIds;
    let started = d.started;
    if (
      commit &&
      e &&
      !started &&
      Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= ACTIVATE
    ) {
      d.x = e.clientX;
      d.y = e.clientY;
      started = true;
      finalOrder = orderAt(d, baseIds) ?? baseIds;
    }
    setOrder(null);
    setDraggingId(null);
    if (commit && started && finalOrder.join() !== baseIds.join()) {
      onReorder(finalOrder);
    }
  }

  // The window listeners call through this, so they always run the handlers
  // of the latest render.
  const handlers = useRef({ move: onPointerMove, finish });
  handlers.current = { move: onPointerMove, finish };

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>, id: string) {
    if (disabled) return;
    const step =
      e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -1
        : e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : 0;
    if (!step) return;
    const from = baseIds.indexOf(id);
    const to = from + step;
    if (to < 0 || to >= baseIds.length) return;
    e.preventDefault();
    onReorder(move(from, to, baseIds));
    // Keep focus on the moved item once it re-renders in its new place.
    requestAnimationFrame(() => els.current.get(id)?.focus());
  }

  return (
    // Positioned, so every item's offsets are measured against the list.
    <div ref={listRef} className={cn("relative", className)} role="list">
      {ids.map((id, index) => {
        const item = byId.get(id);
        if (item === undefined) return null;
        const dragging = draggingId === id;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) els.current.set(id, el);
              else els.current.delete(id);
            }}
            role="listitem"
            tabIndex={disabled ? -1 : 0}
            aria-label={itemLabel?.(item, index, ids.length)}
            onPointerDown={(e) => onPointerDown(e, id)}
            onKeyDown={(e) => onKeyDown(e, id)}
            className={cn(
              "relative select-none rounded-[12px] outline-offset-2",
              !disabled && "cursor-grab touch-none",
              dragging && "z-20 cursor-grabbing shadow-[var(--shadow-raised)]",
            )}
          >
            {renderItem(item, { dragging, index })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Somewhere to drop files from the desktop.
 *
 * Wraps its children; while files hover over it, it says so. Only images are
 * accepted, and the list handed over keeps the order the system gave.
 */
export function FileDropZone({
  onFiles,
  children,
  className,
  label,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
  label: string;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  // dragenter/dragleave fire for every child crossed; count them to know when
  // the pointer has genuinely left the zone.
  const depth = useRef(0);

  const hasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
      {over ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-accent)] bg-[color-mix(in_oklab,var(--color-accent-soft)_85%,transparent)] text-[14px] font-medium text-[var(--color-accent-ink)]">
          {label}
        </div>
      ) : null}
    </div>
  );
}

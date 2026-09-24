"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A grid you reorder by dragging.
 *
 * Pointer events rather than the HTML5 drag-and-drop API: that API does not
 * work on touch screens, gives no control over what the dragged item looks
 * like, and cannot animate the other items out of the way. Here the grabbed
 * item follows the pointer, the others slide aside to show where it will land
 * (a FLIP animation: measured before and after each move, then eased), and
 * nothing is committed until release.
 *
 * Keyboard: focus an item and use the arrow keys to move it one place.
 *
 * `onReorder` receives the new order of ids once, on drop. A press that never
 * moves more than a few pixels is left alone, so a click on the item - to open
 * it, to delete it - still works.
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
  const els = useRef(new Map<string, HTMLElement>());
  const drag = useRef<{
    id: string;
    pointerId: number;
    grabX: number;
    grabY: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    started: boolean;
  } | null>(null);
  /** The translate currently applied to the dragged element. */
  const shift = useRef({ x: 0, y: 0 });
  /** Positions just before a reorder, for the FLIP animation. */
  const before = useRef<Map<string, DOMRect> | null>(null);
  const [tick, setTick] = useState(0);

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

  // After every render during a drag: pin the dragged item under the pointer,
  // and slide every other item from where it was to where it now is.
  useLayoutEffect(() => {
    const d = drag.current;
    if (d?.started) {
      const el = els.current.get(d.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        // The element's resting place is its rect minus the translate we set.
        const restX = rect.left - shift.current.x;
        const restY = rect.top - shift.current.y;
        shift.current = { x: d.x - d.grabX - restX, y: d.y - d.grabY - restY };
        el.style.transform = `translate(${shift.current.x}px, ${shift.current.y}px) scale(1.04)`;
      }
    }
    const prev = before.current;
    if (prev) {
      before.current = null;
      for (const [id, old] of prev) {
        if (id === d?.id) continue;
        const el = els.current.get(id);
        if (!el) continue;
        const now = el.getBoundingClientRect();
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (!dx && !dy) continue;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        // Read a layout property so the browser applies the jump before the
        // transition back starts.
        void el.offsetWidth;
        el.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0, 1)";
        el.style.transform = "";
      }
    }
  });

  function onPointerDown(e: React.PointerEvent<HTMLElement>, id: string) {
    if (disabled || e.button !== 0) return;
    // Buttons inside an item (delete, open) keep their own click.
    if ((e.target as HTMLElement).closest("button, a, input, [data-no-drag]")) return;
    const el = els.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = {
      id,
      pointerId: e.pointerId,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    };
    shift.current = { x: 0, y: 0 };
    /*
     * Listen on the window, not through pointer capture on the item.
     *
     * Reordering makes React move the item's DOM node, and a node that is
     * moved loses its pointer capture - measured: the capture was lost on the
     * very first reorder, and the rest of the gesture went elsewhere. Window
     * listeners do not care which node the pointer is over or where it moved.
     */
    const onMove = (ev: PointerEvent) => handlers.current.move(ev);
    const onUp = (ev: PointerEvent) => {
      handlers.current.finish(ev, true);
      detach();
    };
    const onCancel = (ev: PointerEvent) => {
      handlers.current.finish(ev, false);
      detach();
    };
    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  /**
   * The order the list would have if the dragged item were dropped where the
   * pointer is now, or null if that is where it already sits.
   *
   * The slot is the item the pointer is OVER - not the nearest centre within
   * some radius. A radius wide enough to reach a tall 9:16 thumbnail's centre
   * also reaches its neighbour once the dragged item has moved in beside it,
   * and the item then swaps back and forth under a still pointer. Over-the-rect
   * is stable: after a move the pointer sits on the dragged item's own new
   * slot, which is excluded, so nothing else is under it until it moves on.
   */
  function orderAt(d: NonNullable<typeof drag.current>, list: string[]): string[] | null {
    let target: string | null = null;
    for (const id of list) {
      if (id === d.id) continue;
      const el = els.current.get(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom) {
        target = id;
        break;
      }
    }
    if (!target) return null;
    const from = list.indexOf(d.id);
    const to = list.indexOf(target);
    return from === to ? null : move(from, to, list);
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;

    if (!d.started) {
      if (Math.hypot(d.x - d.startX, d.y - d.startY) < 6) return;
      d.started = true;
      setDraggingId(d.id);
      // No early return: a quick flick may send only this one move before
      // the release, and it must still land where it was aimed.
    }

    const live = orderRef.current ?? baseIds;
    const next = orderAt(d, live);
    if (next) {
      before.current = snapshot();
      setOrder(next);
    } else {
      if (!orderRef.current) setOrder(baseIds);
      setTick((n) => n + 1);
    }
  }

  function finish(e: PointerEvent, commit: boolean) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    const el = els.current.get(d.id);
    if (el) {
      el.style.transition = "transform 160ms cubic-bezier(0.2, 0, 0, 1)";
      el.style.transform = "";
    }
    shift.current = { x: 0, y: 0 };

    /*
     * The release does NOT re-aim. The last move already placed the item
     * where the pointer is, and orderRef holds that order. Re-aiming here read
     * the DOM before React had redrawn it from that move - so the pointer sat
     * over the previous occupant of the slot and the item was pushed back one
     * place, landing a slot short.
     *
     * The one case to settle at release is a gesture with no move at all
     * between press and release: then nothing has been reordered, the DOM is
     * exactly the starting order, and aiming against it is safe.
     */
    let finalOrder = orderRef.current ?? baseIds;
    let started = d.started;
    if (commit && !started && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= 6) {
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

  // `tick` only exists to re-render while the pointer moves.
  void tick;

  return (
    <div className={className} role="list">
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

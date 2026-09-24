"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * The dropdowns, drawn rather than inherited.
 *
 * A native <select> takes almost no styling: on Windows it renders the
 * operating system's own grey list, which on a pale green page looks like a
 * control from another application - and it cannot show two lines, so a plant
 * could never carry its botanical name where it matters most, in the picker
 * where you choose it.
 *
 * The open panel is rendered through a PORTAL, into document.body. That is not
 * a detail: the studio's own card is `overflow-hidden`, and a panel rendered
 * inside it gets sliced off at the card's edge - measured, it does. A portal
 * has no ancestor to be clipped by, so the list is always whole, wherever it
 * is used.
 */

export interface PickerOption {
  value: string;
  label: string;
  /** A second, quieter line - the botanical name, a hint, a count. */
  detail?: string;
}

interface Box {
  left: number;
  width: number;
  /** Page coordinates, so the panel scrolls with the document by itself. */
  top?: number;
  bottom?: number;
}

/** Room to leave against the window edge so the panel never touches it. */
const MARGIN = 8;
const MAX_PANEL = 300;

/**
 * Where the panel goes, in PAGE coordinates.
 *
 * Positioned absolutely against the document rather than fixed against the
 * viewport, which is what makes it follow the page without a scroll listener.
 * The first version used `position: fixed` plus a scroll handler; the handler
 * did not fire reliably and the list sat still while its field scrolled away
 * underneath it. Page coordinates have no such failure mode - there is nothing
 * to keep in sync.
 *
 * Measured once per opening: which side it opens on depends on the room there
 * was at that moment, and having it flip about mid-interaction would be worse
 * than being slightly off after a long scroll.
 */
function anchorFor(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const below = window.innerHeight - r.bottom - MARGIN;
  const above = r.top - MARGIN;

  // Flip up only when below is genuinely too tight AND above is roomier.
  if (below < 160 && above > below) {
    return {
      left: r.left + scrollX,
      width: r.width,
      bottom: document.documentElement.scrollHeight - (r.top + scrollY) + 6,
    };
  }
  return { left: r.left + scrollX, width: r.width, top: r.bottom + scrollY + 6 };
}

function useDismiss(
  open: boolean,
  close: () => void,
  refs: React.RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}

const TRIGGER =
  "flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3.5 py-2.5 text-left text-[14px] transition-colors hover:border-[var(--color-accent)] focus-visible:border-[var(--color-accent)]";

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0 text-[10px] text-[var(--color-ink-faint)] transition-transform",
        open && "rotate-180",
      )}
    >
      ▾
    </span>
  );
}

function Row({
  option,
  selected,
  onPick,
}: {
  option: PickerOption;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors",
        selected
          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
          : "text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-[5px] border text-[10px] leading-none",
          selected
            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
            : "border-[var(--color-line-strong)]",
        )}
      >
        {selected ? "✓" : ""}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">
          {option.label}
        </span>
        {option.detail ? (
          <span className="block truncate text-[12px] text-[var(--color-ink-faint)]">
            {option.detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** The floating list. Lives in document.body, so nothing can clip it. */
function Panel({
  box,
  listId,
  panelRef,
  multiple,
  children,
}: {
  box: Box | null;
  listId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  multiple?: boolean;
  children: React.ReactNode;
}) {
  // document.body only exists once mounted; on the server there is no portal.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !box) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={listId}
      role="listbox"
      aria-multiselectable={multiple}
      style={{
        position: "absolute",
        left: box.left,
        width: box.width,
        ...(box.bottom !== undefined
          ? { bottom: box.bottom }
          : { top: box.top }),
        maxHeight: MAX_PANEL,
      }}
      className="z-50 overflow-y-auto overscroll-contain rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-raised)]"
    >
      {children}
    </div>,
    document.body,
  );
}

/** One choice. `value` may be "" for an explicit "no preference" option. */
export function Picker({
  options,
  value,
  onChange,
  placeholder,
  id,
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();

  const [box, setBox] = useState<Box | null>(null);
  useDismiss(open, () => setOpen(false), [trigger, panel]);

  function toggle() {
    if (open) return setOpen(false);
    if (trigger.current) setBox(anchorFor(trigger.current));
    setOpen(true);
  }

  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        className={TRIGGER}
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? (
            <>
              {current.label}
              {current.detail ? (
                <span className="text-[var(--color-ink-faint)]">
                  {" · "}
                  {current.detail}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[var(--color-ink-faint)]">{placeholder}</span>
          )}
        </span>
        <Chevron open={open} />
      </button>

      {open ? (
        <Panel box={box} listId={listId} panelRef={panel}>
          {options.map((option) => (
            <Row
              key={option.value}
              option={option}
              selected={option.value === value}
              onPick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))}
        </Panel>
      ) : null}
    </>
  );
}

/**
 * Several choices at once.
 *
 * The trigger names them rather than counting them: "Français, Anglais" tells
 * you what you picked, "2 sélectionnés" makes you open it to find out. It
 * falls back to a count past three, where the names stop fitting.
 */
export function MultiPicker({
  options,
  values,
  onToggle,
  placeholder,
  summary,
  id,
}: {
  options: PickerOption[];
  values: string[];
  onToggle: (value: string) => void;
  placeholder?: string;
  /** Overrides the label past three selections, e.g. "5 langues". */
  summary?: (n: number) => string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();

  const [box, setBox] = useState<Box | null>(null);
  useDismiss(open, () => setOpen(false), [trigger, panel]);

  function toggle() {
    if (open) return setOpen(false);
    if (trigger.current) setBox(anchorFor(trigger.current));
    setOpen(true);
  }

  const chosen = options.filter((o) => values.includes(o.value));
  const label =
    chosen.length === 0
      ? null
      : chosen.length <= 3
        ? chosen.map((o) => o.label).join(", ")
        : (summary?.(chosen.length) ?? String(chosen.length));

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        className={TRIGGER}
      >
        <span className="min-w-0 flex-1 truncate">
          {label ?? (
            <span className="text-[var(--color-ink-faint)]">{placeholder}</span>
          )}
        </span>
        <Chevron open={open} />
      </button>

      {open ? (
        <Panel box={box} listId={listId} panelRef={panel} multiple>
          {options.map((option) => (
            <Row
              key={option.value}
              option={option}
              selected={values.includes(option.value)}
              // Stays open: picking several is the point.
              onPick={() => onToggle(option.value)}
            />
          ))}
        </Panel>
      ) : null}
    </>
  );
}

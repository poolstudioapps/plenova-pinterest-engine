"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { anchorFor, useDismiss, type Box } from "@/components/ui/Picker";
import { cn } from "@/lib/utils";

/**
 * A button that opens a list of actions.
 *
 * The "⋯" row menu used to be a <details> with an absolutely positioned list,
 * inside a card that is `overflow-hidden` - so the list opened and was sliced
 * off at the card's edge, with most of its items out of reach. Like the
 * pickers, the list now lives in document.body, positioned against the page,
 * right-aligned under its button (or above it, near the bottom of the
 * window). No container can clip it, wherever the menu is used.
 *
 * Escape and a click elsewhere close it; the arrow keys move between items.
 */
const CloseMenu = createContext<() => void>(() => {});

const ROW_TRIGGER =
  "grid size-8 place-items-center rounded-[var(--radius-control)] text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)] aria-expanded:bg-[var(--color-surface-muted)] aria-expanded:text-[var(--color-ink)]";

/** The "⋯" at the end of a list row. */
export function RowMenu({
  label,
  children,
  onClose,
}: {
  label: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <Menu
      label={label}
      onClose={onClose}
      triggerClassName={ROW_TRIGGER}
      trigger={
        <span aria-hidden className="text-[16px] leading-none">
          ⋯
        </span>
      }
    >
      {children}
    </Menu>
  );
}

export function Menu({
  label,
  trigger,
  triggerClassName,
  showLabel,
  disabled,
  children,
  onClose,
}: {
  label: string;
  /** What the button shows. */
  trigger: ReactNode;
  triggerClassName: string;
  /** The label is visible in the button; otherwise it is the tooltip. */
  showLabel?: boolean;
  disabled?: boolean;
  children: ReactNode;
  /** Called whenever the menu closes, however it closed. */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [mounted, setMounted] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => setMounted(true), []);
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  useDismiss(open, close, [anchor, panel]);

  // Keyboard users land on the first item.
  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
  }, [open]);

  function toggle() {
    if (open) return close();
    if (anchor.current) setBox(anchorFor(anchor.current));
    setOpen(true);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={showLabel ? undefined : label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={toggle}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {mounted && open && box
        ? createPortal(
            <CloseMenu.Provider value={close}>
              <div
                ref={panel}
                id={menuId}
                role="menu"
                aria-label={label}
                onKeyDown={onKeyDown}
                style={{
                  position: "absolute",
                  // Right-aligned under the button, whatever the list's width.
                  left: box.left + box.width,
                  top: box.top,
                  transform: box.above ? "translate(-100%, -100%)" : "translateX(-100%)",
                }}
                className="z-[100] min-w-[200px] overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-raised)]"
              >
                {children}
              </div>
            </CloseMenu.Provider>,
            document.body,
          )
        : null}
    </>
  );
}

export function RowMenuItem({
  danger,
  keepOpen,
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  /** Leave the menu open after the click - the first step of a confirmation. */
  keepOpen?: boolean;
}) {
  const close = useContext(CloseMenu);
  return (
    <button
      {...props}
      type="button"
      role="menuitem"
      onClick={(event) => {
        onClick?.(event);
        if (!keepOpen) close();
      }}
      className={cn(
        "block w-full px-3 py-2 text-left text-[13px] transition-colors outline-none focus-visible:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:text-[var(--color-ink-faint)]",
        danger
          ? "text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
          : "text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]",
      )}
    >
      {children}
    </button>
  );
}

/** The same item, for menus that are not row menus. */
export const MenuItem = RowMenuItem;

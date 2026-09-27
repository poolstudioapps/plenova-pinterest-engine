"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Open dialogs, newest last: Escape only ever closes the one on top. */
const stack: symbol[] = [];
/** The page's own overflow, put back when the last dialog closes. */
let lockedOverflow = "";

/**
 * A dialog over the page.
 *
 * Rendered into document.body, so no card with overflow-hidden or transform
 * above it can clip it or trap its fixed position. Escape and a click on the
 * backdrop close it - unless a dropdown inside took the Escape first.
 */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const me = Symbol("dialog");
    // The page stays still under a dialog: a list opened from a field in it is
    // placed against the page, and would drift if the page scrolled.
    const html = document.documentElement;
    if (stack.length === 0) {
      lockedOverflow = html.style.overflow;
      html.style.overflow = "hidden";
    }
    stack.push(me);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (stack[stack.length - 1] !== me) return;
      event.preventDefault();
      close.current();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => {
      stack.splice(stack.indexOf(me), 1);
      if (stack.length === 0) html.style.overflow = lockedOverflow;
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[60] grid place-items-center bg-[rgb(8_16_7/0.42)] p-4 backdrop-blur-[3px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "dialog-in flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-edge)] bg-[var(--color-surface)] shadow-[var(--shadow-raised)] outline-none",
          // The default width, unless the caller gives its own.
          !/(^|\s)max-w-/.test(className ?? "") && "max-w-lg",
          className,
        )}
      >
        <h2 className="border-b border-[var(--color-line)] px-5 py-4 text-[16px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-line)] bg-[var(--color-canvas)]/60 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import type { PinStatus } from "@/lib/types";

/* --------------------------------------------------------------- layout -- */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[30px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[var(--color-ink-soft)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------- button -- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/*
 * A disabled primary used to be the accent at forty per cent, which reads as a
 * broken button rather than one waiting for something. Disabled is now its own
 * flat, quiet shape in every variant.
 */
const DISABLED =
  "disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-ink-faint)] disabled:border-[var(--color-line)] disabled:shadow-none";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: `bg-[var(--color-accent)] text-white border border-transparent shadow-[var(--shadow-card)] hover:brightness-110 active:brightness-95 ${DISABLED}`,
  secondary: `bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:border-[var(--color-ink-faint)] hover:bg-[var(--color-surface-muted)] ${DISABLED}`,
  ghost: `text-[var(--color-ink-soft)] border border-transparent hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)] ${DISABLED} disabled:bg-transparent`,
  danger: `bg-[var(--color-danger)] text-white border border-transparent hover:brightness-110 ${DISABLED}`,
};

const BUTTON_SIZES = {
  md: "px-4 py-2.5 text-[14px]",
  sm: "px-3 py-1.5 text-[13px]",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition-[filter,background-color,border-color,box-shadow] disabled:cursor-not-allowed",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70",
        className,
      )}
    />
  );
}

/* ---------------------------------------------------------------- forms -- */

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-[var(--color-ink)]"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Shared with the plain file inputs and textareas the app writes by hand. */
const CONTROL_CLASS = "input placeholder:text-[var(--color-ink-faint)]";

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CONTROL_CLASS, "pr-8", className)} />;
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL_CLASS, className)} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(CONTROL_CLASS, "resize-y leading-relaxed", className)}
    />
  );
}

/* --------------------------------------------------------------- status -- */

const STATUS_STYLES: Record<PinStatus, string> = {
  draft: "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]",
  generated: "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]",
  queued: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  scheduled: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  publishing: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  published: "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]",
  failed: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
};

export function StatusBadge({ status }: { status: PinStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium capitalize",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-ink-soft)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- notices -- */

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-[var(--color-line)] bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]",
    warn: "border-transparent bg-[var(--color-warn-soft)] text-[var(--color-warn-ink)]",
    danger:
      "border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  } as const;

  return (
    <div
      className={cn(
        "rounded-[12px] border px-4 py-3 text-[13.5px] leading-relaxed",
        tones[tone],
      )}
    >
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--color-line-strong)] px-6 py-16 text-center">
      <p className="text-[15px] font-medium text-[var(--color-ink)]">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

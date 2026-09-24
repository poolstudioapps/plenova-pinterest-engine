import Link from "next/link";
import { PottedPlant } from "@/components/plants/PottedPlant";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { t, type TranslationKey } from "@/lib/i18n";
import type { PlantIdentity } from "@/lib/data/localize";
import type { PinStatus } from "@/lib/types";

export { Picker, MultiPicker, type PickerOption } from "./Picker";
export { SortableGrid, FileDropZone } from "./Sortable";
export { Menu, MenuItem, RowMenu, RowMenuItem } from "./Menu";

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
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-[var(--color-ink)]">
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

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "ink";

/*
 * A disabled primary used to be the accent at forty per cent, which reads as a
 * broken button rather than one waiting for something. Disabled is now its own
 * flat, quiet shape in every variant.
 */
const DISABLED =
  "disabled:bg-[var(--color-surface-muted)] disabled:text-[var(--color-ink-faint)] disabled:border-[var(--color-line)] disabled:shadow-none";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: `bg-[var(--color-accent)] text-white border border-transparent shadow-[var(--shadow-card)] hover:brightness-110 active:brightness-95 ${DISABLED}`,
  /* The site's own strongest call to action: near-black green, white text. */
  ink: `bg-[var(--color-ink-fill)] text-[var(--color-canvas)] border border-transparent shadow-[var(--shadow-card)] hover:brightness-125 active:brightness-100 ${DISABLED}`,
  secondary: `bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-muted)] ${DISABLED}`,
  ghost: `text-[var(--color-ink-soft)] border border-transparent hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)] ${DISABLED} disabled:bg-transparent`,
  danger: `bg-[var(--color-danger)] text-white border border-transparent hover:brightness-110 ${DISABLED}`,
};

/* Generous horizontal padding, because a pill needs it to read as one. */
const BUTTON_SIZES = {
  md: "px-5 py-2.5 text-[14px]",
  sm: "px-3.5 py-1.5 text-[13px]",
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
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] font-medium transition-[filter,background-color,border-color,box-shadow] disabled:cursor-not-allowed",
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

/**
 * A link that looks like a button - for "go somewhere", where a <button>
 * with `location.href` would reload the whole page and announce itself as an
 * action rather than a destination.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] font-medium transition-[filter,background-color,border-color,box-shadow]",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Chargement"
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
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  /* React 19 passes ref as an ordinary prop; the DOM attribute type does not
     carry it, so it is declared here. */
  ref?: Ref<HTMLInputElement>;
}) {
  return <input {...props} ref={ref} className={cn(CONTROL_CLASS, className)} />;
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

/*
 * The stored status is an English identifier; it was being printed straight to
 * the screen with a `capitalize` class, so a French interface said "Published".
 */
const STATUS_KEYS: Record<PinStatus, TranslationKey> = {
  draft: "status.draft",
  generated: "status.generated",
  queued: "status.queued",
  scheduled: "status.scheduled",
  publishing: "status.publishing",
  published: "status.published",
  failed: "status.failed",
};

export function StatusBadge({ status }: { status: PinStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium",
        STATUS_STYLES[status],
      )}
    >
      {t(STATUS_KEYS[status])}
    </span>
  );
}

/**
 * A plant, named both ways.
 *
 * The common name is what you look for; the botanical name is what tells you
 * the image is actually the species you meant. Eight of the fifty species are
 * commonly called by their botanical name already, and those render as one
 * line - `identity.latin` is null for them rather than a repeat.
 *
 * When the species was never established, the second line says so instead of
 * showing a botanical name nobody confirmed.
 */
export function PlantName({
  identity,
  size = "md",
}: {
  identity: PlantIdentity;
  size?: "sm" | "md";
}) {
  const small = size === "sm";
  return (
    <span className="block min-w-0">
      <span
        className={cn(
          "block truncate font-semibold text-[var(--color-ink)]",
          small ? "text-[13px]" : "text-[15px]",
        )}
      >
        {identity.primary}
        {identity.cultivar ? (
          <span className="font-normal text-[var(--color-ink-soft)]">
            {" "}
            {identity.cultivar}
          </span>
        ) : null}
      </span>

      {identity.latin ? (
        <span
          lang="la"
          className={cn(
            "block truncate italic text-[var(--color-ink-faint)]",
            small ? "text-[11.5px]" : "text-[12.5px]",
          )}
        >
          {identity.latin}
        </span>
      ) : !identity.known ? (
        <span
          className={cn(
            "block truncate text-[var(--color-ink-faint)]",
            small ? "text-[11.5px]" : "text-[12.5px]",
          )}
        >
          {t("plant.unconfirmed")}
        </span>
      ) : null}
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
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--color-line-strong)] px-6 py-14 text-center">
      <PottedPlant className="mb-3 size-20" />
      <p className="text-[15px] font-medium text-[var(--color-ink)]">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

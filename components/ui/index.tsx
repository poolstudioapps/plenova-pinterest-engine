import Link from "next/link";
import { Info, Warning, WarningCircle } from "@phosphor-icons/react/ssr";
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
export { Dialog } from "./Dialog";
export { Pager, paginate, PAGE_SIZE } from "./Pager";

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
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        {/* Inter's optical size turns this into its Display drawing: the
            tight tracking is the face's own, not a squeeze. */}
        <h1 className="text-[28px] leading-[1.1] font-bold tracking-[-0.025em] text-[var(--color-ink)] md:text-[34px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2.5 max-w-[62ch] text-[14.5px] leading-relaxed text-[var(--color-ink-soft)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- tiles -- */

/**
 * The one shape of a figure tile, everywhere a number is shown on its own
 * (Performances, Publication, LTV, due dates, Versus): a white chip lifted
 * off whatever it sits on by a hairline and a soft green shadow, rather than
 * a tinted block. Tinted blocks on a white card read as grey slabs; a lifted
 * chip reads as an object you can look at.
 */
export const TILE =
  "relative flex flex-col overflow-hidden rounded-[18px] bg-[var(--color-tile)] px-4 pt-3.5 pb-4 ring-1 ring-[var(--color-edge)] shadow-[0_1px_2px_rgb(29_47_27/0.05),0_8px_20px_-14px_rgb(29_47_27/0.35)]";
/** The label on a tile: small, medium weight, quiet. */
export const TILE_LABEL = "text-[12.5px] leading-snug font-medium text-[var(--color-ink-soft)]";
/** The figure on a tile: the largest thing in it, figures that do not jitter. */
export const TILE_VALUE = "figures text-[28px] leading-none font-semibold tracking-[-0.035em]";

/* --------------------------------------------------------------- button -- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "ink";

/*
 * A disabled primary used to be the accent at forty per cent, which reads as a
 * broken button rather than one waiting for something. Disabled is now its own
 * flat, quiet shape in every variant.
 */
const DISABLED =
  "disabled:bg-[var(--color-surface-muted)] disabled:bg-none disabled:text-[var(--color-ink-faint)] disabled:border-[var(--color-line)] disabled:shadow-none";

/*
 * Filled buttons carry a faint light from above - a sheen at the top and a
 * one-pixel highlight on the upper edge - so they read as something you can
 * press rather than a coloured rectangle.
 */
const SHEEN =
  "bg-linear-to-b from-white/[0.09] to-transparent shadow-[inset_0_1px_0_rgb(255_255_255/0.16),var(--shadow-card)]";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: `bg-[var(--color-accent)] text-[var(--color-on-accent)] border border-transparent ${SHEEN} hover:brightness-110 active:brightness-95 ${DISABLED}`,
  /* The site's own strongest call to action: near-black green, white text. */
  ink: `bg-[var(--color-ink-fill)] text-[var(--color-canvas)] border border-transparent ${SHEEN} hover:brightness-125 active:brightness-100 ${DISABLED}`,
  secondary: `bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line-strong)] shadow-[0_1px_2px_rgb(29_47_27/0.05)] hover:border-[var(--color-ink-faint)] hover:bg-[var(--color-canvas)] ${DISABLED}`,
  ghost: `text-[var(--color-ink-soft)] border border-transparent hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)] ${DISABLED} disabled:bg-transparent`,
  danger: `bg-[var(--color-danger)] text-[var(--color-on-danger)] border border-transparent ${SHEEN} hover:brightness-110 ${DISABLED}`,
};

/*
 * Every button gives under the finger: a small scale on press (not on hover,
 * which a phone would leave stuck), fast, on a curve that starts at once.
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] text-center font-medium transition-[filter,background-color,border-color,box-shadow,scale] duration-150 ease-out active:not-disabled:scale-[0.97] disabled:cursor-not-allowed";

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
        BUTTON_BASE,
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
        BUTTON_BASE,
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
    <div className="min-w-0 space-y-1.5">
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
    info: "border-[var(--color-edge)] bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]",
    warn: "border-[color-mix(in_oklab,var(--color-warn)_16%,transparent)] bg-[var(--color-warn-soft)] text-[var(--color-warn-ink)]",
    danger:
      "border-[color-mix(in_oklab,var(--color-danger)_16%,transparent)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  } as const;
  /* A shape as well as a colour, so the tone is not carried by hue alone. */
  const Glyph = tone === "warn" ? Warning : tone === "danger" ? WarningCircle : Info;
  const glyphTone = {
    info: "text-[var(--color-accent)]",
    warn: "text-[var(--color-warn)]",
    danger: "text-[var(--color-danger)]",
  } as const;

  return (
    <div
      className={cn(
        "panel-in flex gap-3 rounded-[14px] border px-4 py-3 text-[13.5px] leading-relaxed",
        tones[tone],
      )}
    >
      <Glyph
        aria-hidden
        size={18}
        weight="duotone"
        className={cn("mt-[1px] shrink-0", glyphTone[tone])}
      />
      <div className="min-w-0 flex-1">
        {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
        {children}
      </div>
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
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-edge)] bg-linear-to-b from-[var(--color-surface)] to-[var(--color-surface)]/30 px-6 py-14 text-center">
      {/* A soft pool of the brand green behind the plant, where the eye lands. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-40 w-72 -translate-x-1/2 -translate-y-1/3 rounded-full bg-[var(--color-accent-soft)] opacity-70 blur-3xl"
      />
      <PottedPlant className="relative mb-4 size-20" />
      <p className="relative text-[16px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
        {title}
      </p>
      <p className="relative mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
        {description}
      </p>
      {action ? <div className="relative mt-6">{action}</div> : null}
    </div>
  );
}

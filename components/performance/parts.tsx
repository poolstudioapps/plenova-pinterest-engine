"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarBlank,
  ChartLineUp,
  type Icon,
} from "@phosphor-icons/react";
import { Card, TILE, TILE_LABEL, TILE_VALUE } from "@/components/ui";
import { HANDED_OVER, Sliding } from "@/components/ui/Indicator";
import { isCalendarDay, type Range } from "@/lib/performance/compute";
import { cn } from "@/lib/utils";
import { LineChart, type LineSeries } from "./LineChart";
import { Sparkline } from "./Sparkline";

/* ------------------------------------------------------------- tiles -- */

export type Better = "up" | "down" | null;

export function Delta({
  now,
  before,
  better,
}: {
  now: number | null;
  before: number | null;
  better: Better;
}) {
  if (now === null || before === null || before === 0) return null;
  const change = (now - before) / Math.abs(before);
  if (!Number.isFinite(change) || Math.abs(change) < 0.005) {
    return (
      <span className="rounded-full bg-[var(--color-surface-muted)] px-1.5 py-px text-[11px] font-medium text-[var(--color-ink-faint)]">
        stable
      </span>
    );
  }
  const good = better === null ? null : change > 0 === (better === "up");
  // The direction is drawn (the arrow) as well as coloured, so it survives
  // for someone who cannot tell the green from the red.
  const Arrow = change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "figures inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-semibold",
        good === null
          ? "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]"
          : good
            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
            : "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
      )}
      title="Par rapport à la période de même durée juste avant"
    >
      <Arrow aria-hidden size={11} weight="bold" />
      {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
        Math.abs(change) * 100,
      )}
      {" "}%
    </span>
  );
}

/*
 * Whether figures crossfade when they change: yes for a period picked from
 * the presets, no while dates are being typed - a blur on every keystroke is
 * noise, not information.
 */
export const Crossfade = createContext(true);

/** The group of tiles a tile belongs to, when its tiles pick the chart below them. */
const Group = createContext<{
  selected: string;
  select: (id: string) => void;
  chart: string;
} | null>(null);

/**
 * A ring that slides from the tile shown in the chart to the next one picked:
 * drawn behind the tiles, it shows only where it passes their edges.
 */
const RING =
  "rounded-[18px] shadow-[0_0_0_2px_var(--color-accent),0_0_0_6px_color-mix(in_oklab,var(--color-accent)_14%,transparent)]";

/**
 * Tiles whose click shows their figure, day by day, in the chart under them
 * (ChartPanel). `selected` is the tile shown; the page remembers it.
 */
export function TileGroup({
  label,
  selected,
  onSelect,
  chart,
  className,
  children,
}: {
  label: string;
  selected: string;
  onSelect: (id: string) => void;
  /** The id of the chart the tiles drive, for assistive technology. */
  chart: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Group.Provider value={{ selected, select: onSelect, chart }}>
      <Sliding
        role="group"
        aria-label={label}
        watch={selected}
        indicatorClassName={RING}
        className={className}
      >
        {children}
      </Sliding>
    </Group.Provider>
  );
}

export function Tile({
  id,
  label,
  value,
  sub,
  hint,
  now,
  before,
  better = "up",
  spark,
}: {
  /** Inside a TileGroup: the chart this tile shows when clicked. */
  id?: string;
  label: string;
  value: string;
  sub?: ReactNode;
  hint?: string;
  now?: number | null;
  before?: number | null;
  better?: Better;
  /** The figure day by day over the period, drawn along the foot of the tile. */
  spark?: (number | null)[];
}) {
  const crossfade = useContext(Crossfade);
  const group = useContext(Group);
  const selectable = Boolean(group && id);
  const on = selectable && group?.selected === id;

  const body = (
    <>
      {/* Two lines kept for every label, so the figures of a row line up. */}
      <span className={cn(TILE_LABEL, "block min-h-[2lh]", selectable && "pr-6")}>
        {label}
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Keyed on the value: another period re-inserts it, and it crossfades in. */}
        <span key={value} className={cn(TILE_VALUE, "block", crossfade && "value-in")}>
          {value}
        </span>
        {now !== undefined && before !== undefined ? (
          <Delta now={now} before={before} better={better} />
        ) : null}
      </span>
      {sub ? (
        <span className="figures mt-2 block text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
          {sub}
        </span>
      ) : null}
      {spark ? (
        // Full-bleed along the foot of the tile, fading into it.
        <div className="-mx-4 mt-auto -mb-4 pt-3">
          <Sparkline values={spark} label={`${label}, jour après jour`} />
        </div>
      ) : null}
    </>
  );

  if (!group || !id) {
    return (
      <div className={TILE} title={hint}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-controls={group.chart}
      title={hint}
      onClick={() => group.select(id)}
      className={cn(
        TILE,
        "group/tile cursor-pointer text-left transition-[box-shadow,background-color,scale] duration-200 ease-[var(--ease-out)] active:scale-[0.985]",
        on
          ? // Its own ring until the sliding one has measured itself.
            "bg-[color-mix(in_oklab,var(--color-accent)_4%,var(--color-tile))] ring-2 ring-[var(--color-accent)] group-data-[indicator=ready]/slide:ring-1 group-data-[indicator=ready]/slide:ring-[var(--color-edge)]"
          : "hover:shadow-[0_1px_2px_rgb(29_47_27/0.06),0_14px_28px_-16px_rgb(29_47_27/0.45)] hover:ring-[var(--color-line-strong)]",
      )}
    >
      {/* Says the tile opens a chart: on hover, and always on the one shown. */}
      <ChartLineUp
        aria-hidden
        size={15}
        weight="bold"
        className={cn(
          "absolute top-3.5 right-3.5 transition-[opacity,color] duration-200",
          on
            ? "text-[var(--color-accent)] opacity-100"
            : "text-[var(--color-ink-faint)] opacity-0 group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100",
        )}
      />
      {body}
    </button>
  );
}

/* ------------------------------------------------------------- chart -- */

export interface ChartDef {
  /** What the line is: shown above the chart, and read out for it. */
  title: string;
  /** How to read it: "moyenne par jour, semaine par semaine"... */
  caption?: string;
  labels: string[];
  series: LineSeries[];
  format: (v: number) => string;
  /** For the axis when it needs fewer decimals than the tooltip. */
  tick?: (v: number) => string;
  /** The smallest gap between two gridlines (1 for counts and euros). */
  minStep?: number;
  /** False for a level that only drifts: the scale fits the line (see LineChart). */
  zero?: boolean;
  height?: number;
}

/**
 * The chart under a group of tiles. It draws itself the first time; when
 * another tile is picked, the new line crossfades in through a slight blur
 * instead of redrawing - picking is quick and frequent, a sweep every time
 * would slow it down.
 */
export function ChartPanel({
  id,
  domId,
  chart,
}: {
  /** Which tile's chart this is. */
  id: string;
  domId: string;
  chart: ChartDef;
}) {
  const [shown, setShown] = useState(id);
  const [swapped, setSwapped] = useState(false);
  if (shown !== id) {
    setShown(id);
    setSwapped(true);
  }
  return (
    <div id={domId} className="mt-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p
          key={`title-${id}`}
          className={cn(
            "text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]",
            swapped && "value-in",
          )}
        >
          {chart.title}
        </p>
        {chart.caption ? (
          <p className="text-[11.5px] text-[var(--color-ink-faint)]">
            {chart.caption}
          </p>
        ) : null}
      </div>
      <div key={id} className={cn(swapped && "chart-swap")}>
        <LineChart
          ariaLabel={chart.title}
          labels={chart.labels}
          series={chart.series}
          format={chart.format}
          tick={chart.tick}
          minStep={chart.minStep}
          zero={chart.zero}
          height={chart.height}
          animate={!swapped}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- section -- */

export function Section({
  title,
  icon: Glyph,
  source,
  toolbar,
  children,
  missing,
}: {
  title: string;
  icon: Icon;
  source: string;
  /** Filters of the section's own, under its title. */
  toolbar?: ReactNode;
  children: ReactNode;
  missing?: string | null;
}) {
  return (
    <Card className="p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-2.5 text-[16.5px] font-semibold tracking-[-0.015em]">
          <span className="grid size-8 place-items-center rounded-[10px] bg-[var(--color-surface-muted)] text-[var(--color-accent-ink)]">
            <Glyph aria-hidden size={17} weight="duotone" />
          </span>
          {title}
        </h2>
        <span className="text-[12px] text-[var(--color-ink-faint)]">
          {source}
        </span>
      </div>
      {toolbar ? <div className="-mt-1 mb-5">{toolbar}</div> : null}
      {missing ? (
        <p className="rounded-[14px] bg-[var(--color-canvas)] px-4 py-3 text-[13px] text-[var(--color-ink-soft)]">
          {missing}
        </p>
      ) : (
        children
      )}
    </Card>
  );
}

export const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4";

/* ---------------------------------------------------------- controls -- */

/** A row of choices whose highlight slides from one to the next (periods, stores...). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
}: {
  label: string;
  /** Null when none is current (dates typed in). */
  value: T | null;
  options: { id: T; label: ReactNode }[];
  onChange: (id: T) => void;
  size?: "md" | "sm";
}) {
  return (
    <Sliding
      role="group"
      aria-label={label}
      watch={value}
      indicatorClassName="rounded-full bg-[var(--color-pill)] shadow-[var(--shadow-card)]"
      className="flex flex-wrap gap-0.5 rounded-full bg-[var(--color-surface-muted)] p-1 shadow-[var(--shadow-inset)]"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            "relative inline-flex items-center gap-1.5 rounded-full font-medium transition-[background-color,color,box-shadow,scale] duration-200 active:scale-[0.96]",
            size === "md" ? "px-3.5 py-1.5 text-[13px]" : "px-3 py-1 text-[12.5px]",
            value === o.id
              ? `bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)] ${HANDED_OVER}`
              : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </Sliding>
  );
}

/*
 * The native date field, stripped to its text inside the range pill. Its own
 * calendar icon is hidden (the pill has one), so a click on the field opens
 * the calendar - otherwise a mouse could only type the date.
 */
const openCalendar = (e: React.MouseEvent<HTMLInputElement>) => {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    // Refused (not a user gesture, or not supported): typing still works.
  }
};

const DATE =
  "figures w-[6.75rem] rounded-[8px] sm:w-[7.6rem] bg-transparent px-1 py-1 text-[13px] text-[var(--color-ink)] outline-none focus-visible:bg-[var(--color-surface-muted)] [&::-webkit-calendar-picker-indicator]:hidden";

/** Two dates in a pill; lit up when the dates are a choice of their own (no preset). */
export function DatePill({
  range,
  min,
  max,
  active,
  onChange,
  label = "Période",
}: {
  range: Range;
  min: string;
  max: string;
  active: boolean;
  onChange: (next: Range) => void;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex max-w-full min-w-0 flex-wrap items-center gap-1 rounded-[20px] border bg-[var(--color-surface)] py-1 pr-2 pl-3 transition-[border-color,box-shadow]",
        active
          ? "border-[var(--color-accent)] shadow-[0_0_0_3px_var(--color-accent-soft)]"
          : "border-[var(--color-line-strong)]",
      )}
    >
      <CalendarBlank aria-hidden size={16} className="shrink-0 text-[var(--color-ink-faint)]" />
      <input
        type="date"
        aria-label="Du"
        value={range.from}
        min={min}
        max={max}
        onChange={(e) => onChange({ from: e.target.value, to: range.to })}
        onClick={openCalendar}
        className={DATE}
      />
      <span aria-hidden className="text-[12px] text-[var(--color-ink-faint)]">→</span>
      <input
        type="date"
        aria-label="Au"
        value={range.to}
        min={min}
        max={max}
        onChange={(e) => onChange({ from: range.from, to: e.target.value })}
        onClick={openCalendar}
        className={DATE}
      />
    </div>
  );
}

/** Half-typed or impossible dates are refused; the rest is kept within the data. */
export function fixRange(next: Range, min: string, max: string): Range | null {
  const valid = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    isCalendarDay(d);
  if (!valid(next.from) || !valid(next.to)) return null;
  const clamp = (d: string) => (d < min ? min : d > max ? max : d);
  const a = clamp(next.from);
  const b = clamp(next.to);
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/** Changes some of the address bar's parameters, keeping the others. */
export function writeQuery(set: Record<string, string | null>) {
  const q = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(set)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
}

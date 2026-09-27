"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface LineSeries {
  name: string;
  /** A CSS colour (a var(--color-series-*) token). */
  color: string;
  values: (number | null)[];
}

type Point = [number, number];

/**
 * A smooth line through the points that never overshoots them (monotone
 * cubic, Fritsch-Carlson): a day at zero stays at zero instead of the curve
 * dipping under the axis to get there, which a plain spline would do.
 */
function monotone(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const [x0, y0] = points[0]!;
  if (n === 1) return `M${x0.toFixed(1)},${y0.toFixed(1)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    dx.push(b[0] - a[0]);
    slope.push((b[1] - a[1]) / (b[0] - a[0] || 1));
  }
  const tangent: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1]!;
    const s1 = slope[i]!;
    tangent.push(s0 * s1 <= 0 ? 0 : (s0 + s1) / 2);
  }
  tangent.push(slope[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i]!;
    if (s === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i]! / s;
    const b = tangent[i + 1]! / s;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * s;
      tangent[i + 1] = t * b * s;
    }
  }
  let d = `M${x0.toFixed(1)},${y0.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${(ax + h).toFixed(1)},${(ay + h * tangent[i]!).toFixed(1)} ${(bx - h).toFixed(1)},${(by - h * tangent[i + 1]!).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  return d;
}

/**
 * A plain SVG line chart: one axis, a hairline grid, 2px lines over a faint
 * wash of their colour, a crosshair with a tooltip on hover or touch, and a
 * legend when there are two series. The width follows its container.
 */
export function LineChart({
  labels,
  series,
  format,
  height = 220,
  ariaLabel,
}: {
  labels: string[];
  series: LineSeries[];
  format: (v: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pad = { top: 14, right: 14, bottom: 26, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = labels.length;

  const { min, max, ticks } = useMemo(() => {
    const all = series.flatMap((s) =>
      s.values.filter((v): v is number => v !== null),
    );
    // Zero is always on the scale; a day of net refunds goes below it.
    const top = Math.max(1, ...all);
    const bottom = Math.min(0, ...all);
    // A "nice" step: 1, 2 or 5 times a power of ten, about four gridlines,
    // never under 1 (counts and euros: no "0 €, 1 €, 1 €").
    const raw = (top - bottom) / 4;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const step = Math.max(
      1,
      [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw,
    );
    const niceMin = Math.floor(bottom / step) * step;
    const niceMax = Math.ceil(top / step) * step;
    return {
      min: niceMin,
      max: niceMax,
      ticks: Array.from(
        { length: Math.round((niceMax - niceMin) / step) + 1 },
        (_, i) => niceMin + i * step,
      ),
    };
  }, [series]);

  const x = (i: number) =>
    pad.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - ((v - min) / (max - min)) * plotH;
  const base = y(Math.max(min, Math.min(0, max)));

  // Each series in runs of consecutive known days: a missing day is a gap in
  // the line, not a drop to zero.
  const drawn = series.map((s, index) => {
    const runs: Point[][] = [];
    let run: Point[] = [];
    s.values.forEach((v, i) => {
      if (v === null) {
        if (run.length) runs.push(run);
        run = [];
        return;
      }
      run.push([x(i), y(v)]);
    });
    if (run.length) runs.push(run);
    const line = runs.map(monotone).join("");
    const area = runs
      .filter((r) => r.length > 1)
      .map(
        (r) =>
          `${monotone(r)}L${r[r.length - 1]![0].toFixed(1)},${base.toFixed(1)}L${r[0]![0].toFixed(1)},${base.toFixed(1)}Z`,
      )
      .join("");
    const last = runs.at(-1)?.at(-1) ?? null;
    return { name: s.name, color: s.color, line, area, last, gradient: `${uid}-g${index}` };
  });

  // About six dates along the bottom, always the first and the last.
  const every = Math.max(1, Math.ceil(n / 6));
  const xTicks = labels
    .map((_, i) => i)
    .filter((i) => i % every === 0 || i === n - 1);
  // The last date is always shown; the regular one just before goes if they would overlap.
  const [beforeLast, lastTick] = xTicks.slice(-2);
  if (
    beforeLast !== undefined &&
    lastTick !== undefined &&
    lastTick - beforeLast < every / 2
  )
    xTicks.splice(xTicks.length - 2, 1);

  function onMove(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const px = clientX - rect.left - pad.left;
    const i = n <= 1 ? 0 : Math.round((px / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  const tipLeft =
    hover === null ? 0 : Math.min(Math.max(x(hover) + 14, 0), width - 196);

  return (
    <div>
      {series.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-4 text-[12.5px] text-[var(--color-ink-soft)]">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-[3px] w-4 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      <div
        ref={box}
        className="relative w-full max-w-full touch-pan-y overflow-hidden select-none"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="block overflow-visible"
        >
          <defs>
            {drawn.map((d) => (
              <linearGradient key={d.gradient} id={d.gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={d.color} stopOpacity={series.length > 1 ? 0.12 : 0.18} />
                <stop offset="100%" stopColor={d.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(t)}
                y2={y(t)}
                // The zero line carries the chart; the others only help read it.
                stroke={t === 0 ? "var(--color-line-strong)" : "var(--color-line)"}
                strokeDasharray={t === 0 ? undefined : "2 4"}
                strokeWidth={1}
              />
              <text
                x={pad.left - 10}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-[var(--color-ink-faint)] text-[11px] tabular-nums"
              >
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={
                i === 0 && n > 1
                  ? "start"
                  : i === n - 1 && n > 1
                    ? "end"
                    : "middle"
              }
              className="fill-[var(--color-ink-faint)] text-[11px]"
            >
              {labels[i]}
            </text>
          ))}
          {drawn.map((d) =>
            d.area ? <path key={`${d.name}-area`} d={d.area} fill={`url(#${d.gradient})`} /> : null,
          )}
          {n === 1
            ? series.map((s) =>
                s.values[0] !== null && s.values[0] !== undefined ? (
                  <circle
                    key={`${s.name}-only`}
                    cx={x(0)}
                    cy={y(s.values[0])}
                    r={4}
                    fill={s.color}
                  />
                ) : null,
              )
            : null}
          {drawn.map((d) => (
            <path
              key={d.name}
              d={d.line}
              fill="none"
              stroke={d.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {/* Where each line ends today, marked: the reading most people want. */}
          {hover === null && n > 1
            ? drawn.map((d) =>
                d.last ? (
                  <circle
                    key={`${d.name}-last`}
                    cx={d.last[0]}
                    cy={d.last[1]}
                    r={3.5}
                    fill={d.color}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ) : null,
              )
            : null}
          {hover !== null ? (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="var(--color-ink-faint)"
                strokeOpacity={0.45}
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              {series.map((s) => {
                const v = s.values[hover];
                return v !== null && v !== undefined ? (
                  <circle
                    key={s.name}
                    cx={x(hover)}
                    cy={y(v)}
                    r={4.5}
                    fill={s.color}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ) : null;
              })}
            </g>
          ) : null}
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-1 z-10 w-[184px] rounded-[12px] border border-[var(--color-edge)] bg-[var(--color-surface)]/95 px-3 py-2.5 text-[12px] shadow-[var(--shadow-raised)] backdrop-blur-sm"
            style={{ left: tipLeft }}
          >
            <p className="mb-1.5 font-semibold text-[var(--color-ink)]">
              {labels[hover]}
            </p>
            {series.map((s) => {
              const v = s.values[hover];
              return (
                <p
                  key={s.name}
                  className="flex items-center justify-between gap-3 text-[var(--color-ink-soft)]"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--color-ink)]">
                    {v === null || v === undefined ? "-" : format(v)}
                  </span>
                </p>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

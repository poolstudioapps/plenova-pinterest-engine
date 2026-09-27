"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface LineSeries {
  name: string;
  /** A CSS colour (a var(--color-series-*) token). */
  color: string;
  values: (number | null)[];
}

/**
 * A plain SVG line chart: one axis, a hairline grid, 2px lines, a crosshair
 * with a tooltip on hover or touch, and a legend when there are two series.
 * The width follows its container.
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

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pad = { top: 12, right: 12, bottom: 26, left: 52 };
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

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return { name: s.name, color: s.color, d };
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
    hover === null ? 0 : Math.min(Math.max(x(hover) + 12, 0), width - 190);

  return (
    <div>
      {series.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-4 text-[12.5px] text-[var(--color-ink-soft)]">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-[2px] w-4 rounded-full"
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
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
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
          {paths.map((line) => (
            <path
              key={line.name}
              d={line.d}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hover !== null ? (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="var(--color-line-strong)"
                strokeWidth={1}
              />
              {series.map((s) => {
                const v = s.values[hover];
                return v !== null && v !== undefined ? (
                  <circle
                    key={s.name}
                    cx={x(hover)}
                    cy={y(v)}
                    r={4}
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
            className="pointer-events-none absolute top-1 z-10 w-[178px] rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[12px] shadow-[var(--shadow-raised)]"
            style={{ left: tipLeft }}
          >
            <p className="mb-1 font-semibold text-[var(--color-ink)]">
              {labels[hover]}
            </p>
            {series.map((s) => {
              const v = s.values[hover];
              return (
                <p
                  key={s.name}
                  className="flex items-center justify-between gap-3 text-[var(--color-ink-soft)]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </span>
                  <span className="font-medium tabular-nums text-[var(--color-ink)]">
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

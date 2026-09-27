import { useId } from "react";
import { monotone, type Point } from "./curve";

const W = 100;
const H = 32;
const PAD = 3;

/**
 * The shape of a figure over the period, drawn small in the corner of its
 * tile: whether "134 subscribers" is a climb or a slide reads at a glance,
 * without a chart of its own. No axis and no numbers - the tile carries those.
 *
 * Drawn in a stretched 100x32 box (the line keeps its width through
 * non-scaling-stroke); the end dot is an HTML dot placed in percent, so it
 * stays round whatever the tile's width.
 */
export function Sparkline({
  values,
  color = "var(--color-accent)",
  label,
}: {
  values: (number | null)[];
  color?: string;
  /** What the line is, for a screen reader: "Revenu par jour". */
  label: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const known = values
    .map((v, i) => (v === null || !Number.isFinite(v) ? null : ([i, v] as const)))
    .filter((p): p is readonly [number, number] => p !== null);
  if (known.length < 2) return null;

  const lo = Math.min(...known.map(([, v]) => v));
  const hi = Math.max(...known.map(([, v]) => v));
  const span = hi - lo;
  const last = values.length - 1 || 1;
  const points: Point[] = known.map(([i, v]) => [
    (i / last) * W,
    // A flat series sits in the middle rather than on the floor.
    span === 0 ? H / 2 : PAD + (1 - (v - lo) / span) * (H - PAD * 2),
  ]);
  const line = monotone(points);
  const [ex, ey] = points.at(-1)!;
  const area = `${line}L${ex.toFixed(1)},${H}L${points[0]![0].toFixed(1)},${H}Z`;

  return (
    <div className="draw-in relative h-10 w-full" role="img" aria-label={label}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${id})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden
        className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--color-tile)]"
        // Kept clear of the tile's rounded edge, which clips whatever passes it.
        style={{ left: `min(${ex}%, calc(100% - 8px))`, top: `${(ey / H) * 100}%`, background: color }}
      />
    </div>
  );
}

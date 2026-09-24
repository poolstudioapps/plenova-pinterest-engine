import { cn } from "@/lib/utils";

/**
 * A seedling that grows with the work it stands for.
 *
 * The stem draws itself up as `progress` goes from 0 to 1 and the leaves
 * unfold one by one on the way - a carousel being written shows as a plant
 * coming up, slide after slide. Each leaf keeps swaying once it is out.
 */
const LEAVES = [
  { from: 0.2, x: 15.6, y: 22, d: "M0 0 C-2 -3.5 -6 -4 -8.5 -2.5 C-6.5 0.5 -3 1.4 0 0 Z", fill: "#3a8a4d" },
  { from: 0.45, x: 15.9, y: 17, d: "M0 0 C2 -3.5 6 -4 8.5 -2.5 C6.5 0.5 3 1.4 0 0 Z", fill: "#43955a" },
  { from: 0.7, x: 16.4, y: 12.8, d: "M0 0 C-1.6 -2.8 -4.8 -3.2 -6.8 -2 C-5.2 0.4 -2.4 1.1 0 0 Z", fill: "#5bab5c" },
  { from: 0.95, x: 16, y: 9.2, d: "M0 0 C-3 -1 -4 -4.5 0 -7 C4 -4.5 3 -1 0 0 Z", fill: "#62b463" },
];

export function Sprout({ progress, className }: { progress: number; className?: string }) {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const grown = 0.18 + 0.82 * p;
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("overflow-visible", className)}>
      <path
        d="M6 29.5 Q16 26.6 26 29.5"
        fill="none"
        stroke="#8b6a4f"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 29 C16 25 14.6 22.5 15.4 19 C16.2 15.5 16.8 13 16 9"
        fill="none"
        stroke="#4f8f4a"
        strokeWidth="1.8"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={1 - grown}
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.2, 0, 0, 1)" }}
      />
      {LEAVES.map((leaf, i) => {
        const origin = `${leaf.x}px ${leaf.y}px`;
        return (
          <g
            key={i}
            style={{
              transformBox: "view-box",
              transformOrigin: origin,
              transform: `scale(${p >= leaf.from ? 1 : 0})`,
              transition: "transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <g
              className="plant-leaf"
              style={{
                transformOrigin: origin,
                animationDuration: `${3 + i * 0.4}s`,
                animationDelay: `${-i * 0.7}s`,
              }}
            >
              <path transform={`translate(${leaf.x} ${leaf.y})`} d={leaf.d} fill={leaf.fill} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

import { cn } from "@/lib/utils";

/**
 * A small monstera in the Plenova pot, its three leaves swaying out of step.
 *
 * Drawn, not downloaded, and pure CSS once on the page: it costs nothing to
 * put in an empty state. Each leaf turns about the point where its stem meets
 * the soil, so the plant moves the way a plant moves. Reduced motion stills it
 * (see globals.css).
 */
const LEAVES = [
  {
    origin: "57px 76px",
    stem: "M57 76 C56 66 50 56 40 49",
    at: "translate(39 51) rotate(-54) scale(1.12)",
    fill: "#2f7442",
    duration: "5.2s",
    delay: "-1.4s",
  },
  {
    origin: "60px 76px",
    stem: "M60 76 C61 62 60 46 61 30",
    at: "translate(61 31) rotate(4) scale(1.12)",
    fill: "#3a8a4d",
    duration: "4.6s",
    delay: "-0.2s",
  },
  {
    origin: "63px 76px",
    stem: "M63 76 C66 66 74 58 85 53",
    at: "translate(85 54) rotate(58) scale(1.12)",
    fill: "#2b6b3d",
    duration: "5.8s",
    delay: "-2.6s",
  },
];

/* A heart-shaped blade, base at the origin and pointing up, four holes cut out. */
const BLADE =
  "M0 0 C-3 2 -9 1.4 -13 -2 C-18.5 -7 -18.5 -18 -14.5 -25 C-10.5 -32 -4.5 -35.5 0 -36 " +
  "C4.5 -35.5 10.5 -32 14.5 -25 C18.5 -18 18.5 -7 13 -2 C9 1.4 3 2 0 0 Z " +
  "M-9.4 -12.5 a1.7 3.4 0 1 0 3.4 0 a1.7 3.4 0 1 0 -3.4 0 Z " +
  "M6 -12.5 a1.7 3.4 0 1 0 3.4 0 a1.7 3.4 0 1 0 -3.4 0 Z " +
  "M-8.6 -22.5 a1.5 3 0 1 0 3 0 a1.5 3 0 1 0 -3 0 Z " +
  "M5.6 -22.5 a1.5 3 0 1 0 3 0 a1.5 3 0 1 0 -3 0 Z";

export function PottedPlant({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn("overflow-visible", className)}>
      <ellipse cx="60" cy="111" rx="26" ry="3.2" fill="#0e1a0c" opacity="0.08" />
      {LEAVES.map((leaf) => (
        <g
          key={leaf.stem}
          className="plant-leaf"
          style={{
            transformOrigin: leaf.origin,
            animationDuration: leaf.duration,
            animationDelay: leaf.delay,
          }}
        >
          <path
            d={leaf.stem}
            fill="none"
            stroke="#4f8f4a"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <g transform={leaf.at}>
            <path d={BLADE} fill={leaf.fill} fillRule="evenodd" />
            <path
              d="M0 -1.5 L0 -33"
              stroke="#cfeab0"
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.85"
            />
          </g>
        </g>
      ))}
      <ellipse cx="60" cy="76.5" rx="24" ry="3.6" fill="#4a3526" />
      <path d="M38 82 H82 L77 106 Q76.4 110 72 110 H48 Q43.6 110 43 106 Z" fill="#ee9f98" />
      <rect x="34" y="73" width="52" height="10" rx="3" fill="#e8928a" />
      <path d="M40 86 L44 104" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

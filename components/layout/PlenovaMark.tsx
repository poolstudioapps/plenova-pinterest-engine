/**
 * The Plenova mark: a leaf inside a scanner's framing corners.
 *
 * Drawn rather than linked as a bitmap, so it stays sharp at the 32px the
 * sidebar uses and at whatever size anything else wants, costs no request, and
 * needs no asset pipeline. The colours are the app icon's own - the lighter
 * green of the product mark, not the darker interface accent, because a logo
 * that shifts with the theme stops being a logo.
 */
export function PlenovaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={className}
      role="img"
      aria-label="Plenova"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1024" height="1024" rx="232" fill="#6FB980" />

      {/* The four framing corners - the "identify this plant" gesture. */}
      <g
        stroke="#FFFFFF"
        strokeWidth="34"
        strokeLinecap="round"
        opacity="0.96"
      >
        <path d="M176 292c0-64 52-116 116-116" />
        <path d="M732 176c64 0 116 52 116 116" />
        <path d="M848 732c0 64-52 116-116 116" />
        <path d="M292 848c-64 0-116-52-116-116" />
      </g>

      {/* The leaf, with the fold that gives it its two lobes. */}
      <path
        d="M616 240c96 164 112 316 84 414-28 98-134 142-302 132-12-166 26-300 114-390 48-48 82-98 104-156z"
        fill="#FFFFFF"
      />
      <path
        d="M398 786c22-126 72-250 158-306"
        stroke="#6FB980"
        strokeWidth="15"
        strokeLinecap="round"
      />
    </svg>
  );
}

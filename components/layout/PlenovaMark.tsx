/**
 * The Plenova mark: a leaf inside a scanner's framing corners.
 *
 * Drawn rather than linked as a bitmap, so it stays sharp at the 32px the
 * sidebar uses and at any other size, costs no request, and needs no asset
 * pipeline. The colours are the app icon's own - the lighter green of the
 * product mark, not the darker interface accent, because a logo that shifts
 * with the theme stops being a logo.
 *
 * The rounded square is drawn IN the SVG. Do not also round it with CSS: a
 * `rounded-[9px]` on a 32px box is a 28% radius against the 22.6% drawn here,
 * so the class trims the corners of the green square unevenly.
 */
const GREEN = "#76BB85";

export function PlenovaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={className}
      role="img"
      aria-label="Plenova"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1024" height="1024" rx="232" fill={GREEN} />

      {/* The four framing corners - the "identify this plant" gesture. */}
      <g
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="36"
        strokeLinecap="round"
      >
        <path d="M180 296c0-64 52-116 116-116" />
        <path d="M728 180c64 0 116 52 116 116" />
        <path d="M844 728c0 64-52 116-116 116" />
        <path d="M296 844c-64 0-116-52-116-116" />
      </g>

      {/*
        The leaf, in three layers: the whole silhouette in white, a faint
        shade on the front lobe, and the green fold cut back out of it.
        The first version drew only the front lobe, which is why the mark
        looked sliced off down its left side.
      */}
      <path
        d="M610 232C690 330 742 470 718 592C696 712 590 792 440 790C400 790 372 786 350 772C298 690 290 590 330 510C378 414 470 380 540 344C592 318 616 282 610 232Z"
        fill="#FFFFFF"
      />
      <path
        d="M396 786C560 792 690 722 716 566C704 704 566 782 396 786Z"
        fill="#EEF2F6"
      />
      <path
        d="M350 772C362 642 442 520 550 478C470 544 412 660 396 786Z"
        fill={GREEN}
      />
    </svg>
  );
}

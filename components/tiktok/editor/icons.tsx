/**
 * The editor's icons: drawn, 16px, one stroke weight, `currentColor`.
 *
 * A toolbar of glyphs from the font (◀ ◆ ▶) read as placeholders; these are
 * the handful of shapes the editor needs, and nothing else.
 */

import type { SVGProps } from "react";

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-4 shrink-0"
      {...props}
    />
  );
}

export const Close = () => (
  <Svg>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);

export const ChevronLeft = () => (
  <Svg>
    <path d="M10 3.5L5.5 8l4.5 4.5" />
  </Svg>
);

export const ChevronRight = () => (
  <Svg>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </Svg>
);

export const Undo = () => (
  <Svg>
    <path d="M5.5 3.5L2.5 6.5l3 3" />
    <path d="M2.5 6.5h7a4 4 0 010 8H7" />
  </Svg>
);

export const Redo = () => (
  <Svg>
    <path d="M10.5 3.5l3 3-3 3" />
    <path d="M13.5 6.5h-7a4 4 0 000 8H9" />
  </Svg>
);

export const Grid = () => (
  <Svg>
    <rect x="2" y="2" width="12" height="12" rx="1.5" />
    <path d="M6 2v12M10 2v12M2 6h12M2 10h12" />
  </Svg>
);

export const Phone = () => (
  <Svg>
    <rect x="4" y="1.5" width="8" height="13" rx="1.8" />
    <path d="M10.2 5.5v.01M10.2 8v.01M10.2 10.5v.01M5.7 11.8h3" />
  </Svg>
);

export const Download = () => (
  <Svg>
    <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7" />
    <path d="M2.5 11.5v1a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5v-1" />
  </Svg>
);

export const Image = () => (
  <Svg>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <circle cx="5.8" cy="6" r="1.2" />
    <path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" />
  </Svg>
);

export const Crop = () => (
  <Svg>
    <path d="M4.5 1.5v10h10" />
    <path d="M1.5 4.5h10v10" />
  </Svg>
);

export const Sparkles = () => (
  <Svg>
    <path d="M6.5 2l1.1 3.1L10.7 6.2 7.6 7.3 6.5 10.4 5.4 7.3 2.3 6.2l3.1-1.1z" />
    <path d="M12 9.5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" />
  </Svg>
);

export const AlignLeft = () => (
  <Svg>
    <path d="M2.5 4h11M2.5 8h7M2.5 12h9" />
  </Svg>
);

export const AlignCenter = () => (
  <Svg>
    <path d="M2.5 4h11M4.5 8h7M3.5 12h9" />
  </Svg>
);

export const AlignRight = () => (
  <Svg>
    <path d="M2.5 4h11M6.5 8h7M4.5 12h9" />
  </Svg>
);

/** Centre on the vertical axis: the block slides left or right. */
export const CenterH = () => (
  <Svg>
    <path d="M8 1.5v13" />
    <rect x="3.5" y="5" width="9" height="6" rx="1.2" />
  </Svg>
);

/** Centre on the horizontal axis: the block slides up or down. */
export const CenterV = () => (
  <Svg>
    <path d="M1.5 8h13" />
    <rect x="5" y="3.5" width="6" height="9" rx="1.2" />
  </Svg>
);

export const Keyboard = () => (
  <Svg>
    <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" />
    <path d="M4 6.8h.01M6.5 6.8h.01M9 6.8h.01M11.5 6.8h.01M5 9.8h6" />
  </Svg>
);

export const Check = () => (
  <Svg>
    <path d="M3 8.5l3 3 7-7" />
  </Svg>
);

export const Warning = () => (
  <Svg>
    <path d="M8 2.2L14.5 13.5h-13z" />
    <path d="M8 6.5v3M8 11.5v.01" />
  </Svg>
);

export const Upload = () => (
  <Svg>
    <path d="M8 10.5v-8M4.5 6L8 2.5 11.5 6" />
    <path d="M2.5 11.5v1a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5v-1" />
  </Svg>
);

export const Reset = () => (
  <Svg>
    <path d="M2.5 8a5.5 5.5 0 109.2-4.1" />
    <path d="M12.5 1.5v2.8H9.7" />
  </Svg>
);

export const Copy = () => (
  <Svg>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
  </Svg>
);

export const Text = () => (
  <Svg>
    <path d="M3 3.5h10M8 3.5v9.5" />
  </Svg>
);

export const Search = () => (
  <Svg>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5l3 3" />
  </Svg>
);

export const Plus = () => (
  <Svg>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);

export const Trash = () => (
  <Svg>
    <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.6a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8.6" />
    <path d="M6.8 7v4.5M9.2 7v4.5" />
  </Svg>
);

export const Bookmark = () => (
  <Svg>
    <path d="M4 2.5h8v11l-4-2.8-4 2.8z" />
  </Svg>
);

export const Duplicate = () => (
  <Svg>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
    <path d="M9.5 7.5v4M7.5 9.5h4" />
  </Svg>
);

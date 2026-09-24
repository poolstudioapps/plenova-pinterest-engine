import { useId } from "react";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/overlay";

/**
 * Where TikTok's own interface lands on a 4:5 photo, in slide pixels.
 *
 * Approximate on purpose, and said so on screen. The photo is shown full
 * width; how much of it the right-hand buttons and the caption cover depends
 * on the phone's height. These are the areas that end up covered on the
 * shorter screens still in wide use - text kept out of them reads everywhere.
 */
export const TIKTOK_ZONES = [
  { id: "rail", x: 915, y: 500, w: SLIDE_WIDTH - 915, h: SLIDE_HEIGHT - 500 },
  { id: "caption", x: 0, y: 1140, w: 915, h: SLIDE_HEIGHT - 1140 },
] as const;

export type ZoneId = (typeof TIKTOK_ZONES)[number]["id"];

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Which zones a box reaches into by more than a sliver. */
export function zonesHit(box: Box): ZoneId[] {
  const hits: ZoneId[] = [];
  for (const z of TIKTOK_ZONES) {
    const w = Math.min(box.right, z.x + z.w) - Math.max(box.left, z.x);
    const h = Math.min(box.bottom, z.y + z.h) - Math.max(box.top, z.y);
    if (w > 6 && h > 6) hits.push(z.id);
  }
  return hits;
}

/** True when some of the box falls outside the slide, where the JPEG cuts it. */
export function outsideFrame(box: Box): boolean {
  return (
    box.left < -2 ||
    box.top < -2 ||
    box.right > SLIDE_WIDTH + 2 ||
    box.bottom > SLIDE_HEIGHT + 2
  );
}

const ICON = {
  fill: "none",
  stroke: "#fff",
  strokeWidth: 6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * A sketch of TikTok's interface over the slide: the button rail, the
 * caption, and the areas they cover, hatched - red when text sits under them.
 */
export function TikTokZones({ hot }: { hot: ZoneId[] }) {
  const hatch = useId().replace(/:/g, "");
  const rail = 997;
  return (
    <svg
      width={SLIDE_WIDTH}
      height={SLIDE_HEIGHT}
      viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
      aria-hidden
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
    >
      <defs>
        <pattern
          id={hatch}
          width="22"
          height="22"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="22" stroke="rgba(255,255,255,0.22)" strokeWidth="7" />
        </pattern>
        <filter id={`${hatch}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      {TIKTOK_ZONES.map((z) => {
        const isHot = hot.includes(z.id);
        return (
          <g key={z.id}>
            <rect
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              fill={isHot ? "rgba(234,64,64,0.34)" : "rgba(0,0,0,0.26)"}
            />
            <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={`url(#${hatch})`} />
            <rect
              x={z.x + 2}
              y={z.y + 2}
              width={z.w - 4}
              height={z.h - 4}
              fill="none"
              stroke={isHot ? "#ff6b6b" : "rgba(255,255,255,0.55)"}
              strokeWidth="4"
              strokeDasharray="18 12"
            />
          </g>
        );
      })}

      <g filter={`url(#${hatch}-shadow)`}>
        {/* Profile picture and its follow badge. */}
        <circle cx={rail} cy="590" r="44" fill="rgba(255,255,255,0.25)" stroke="#fff" strokeWidth="5" />
        <circle cx={rail} cy="636" r="17" fill="#ea4040" />
        <path d={`M${rail - 8} 636h16M${rail} 628v16`} {...ICON} strokeWidth={4} />

        {/* Like. */}
        <path
          d={`M${rail} 790c-30-20-42-38-38-56 3-14 22-20 38-4 16-16 35-10 38 4 4 18-8 36-38 56z`}
          fill="#fff"
        />
        <rect x={rail - 42} y="806" width="84" height="18" rx="9" fill="rgba(255,255,255,0.85)" />

        {/* Comment. */}
        <path
          d={`M${rail - 34} 900c0-22 15-34 34-34s34 12 34 34-15 34-34 34c-7 0-13-1-18-4l-14 6 4-13c-4-6-6-14-6-23z`}
          fill="#fff"
        />
        <rect x={rail - 42} y="950" width="84" height="18" rx="9" fill="rgba(255,255,255,0.85)" />

        {/* Save. */}
        <path d={`M${rail - 24} 1010h48v68l-24-17-24 17z`} fill="#fff" />
        <rect x={rail - 42} y="1094" width="84" height="18" rx="9" fill="rgba(255,255,255,0.85)" />

        {/* Share. */}
        <path d={`M${rail + 30} 1170l-30-28v16c-28 2-44 18-48 42 12-12 26-17 48-17v16z`} fill="#fff" />

        {/* The spinning record. */}
        <circle cx={rail} cy="1282" r="38" fill="#1f1f1f" stroke="#555" strokeWidth="10" />
        <circle cx={rail} cy="1282" r="12" fill="#888" />

        {/* Username, caption, sound. */}
        <text
          x="44"
          y="1196"
          fill="#fff"
          fontSize="36"
          fontWeight="700"
          fontFamily="'TikTok Sans', system-ui, sans-serif"
        >
          @plenova
        </text>
        <rect x="44" y="1222" width="600" height="22" rx="11" fill="rgba(255,255,255,0.85)" />
        <rect x="44" y="1258" width="430" height="22" rx="11" fill="rgba(255,255,255,0.85)" />
        <rect x="44" y="1300" width="300" height="20" rx="10" fill="rgba(255,255,255,0.6)" />
      </g>
    </svg>
  );
}

/** Thirds, centre lines and a safe margin - for lining blocks up by eye. */
export function GridGuides() {
  const margin = 60;
  const line = { stroke: "rgba(255,255,255,0.55)", strokeWidth: 3 };
  return (
    <svg
      width={SLIDE_WIDTH}
      height={SLIDE_HEIGHT}
      viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
      aria-hidden
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
    >
      {[SLIDE_WIDTH / 3, (SLIDE_WIDTH * 2) / 3].map((x) => (
        <line key={`v${x}`} x1={x} y1={0} x2={x} y2={SLIDE_HEIGHT} {...line} />
      ))}
      {[SLIDE_HEIGHT / 3, (SLIDE_HEIGHT * 2) / 3].map((y) => (
        <line key={`h${y}`} x1={0} y1={y} x2={SLIDE_WIDTH} y2={y} {...line} />
      ))}
      <line
        x1={SLIDE_WIDTH / 2}
        y1={0}
        x2={SLIDE_WIDTH / 2}
        y2={SLIDE_HEIGHT}
        {...line}
        strokeDasharray="14 12"
        stroke="rgba(255,255,255,0.4)"
      />
      <line
        x1={0}
        y1={SLIDE_HEIGHT / 2}
        x2={SLIDE_WIDTH}
        y2={SLIDE_HEIGHT / 2}
        {...line}
        strokeDasharray="14 12"
        stroke="rgba(255,255,255,0.4)"
      />
      <rect
        x={margin}
        y={margin}
        width={SLIDE_WIDTH - margin * 2}
        height={SLIDE_HEIGHT - margin * 2}
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="3"
        strokeDasharray="6 10"
      />
    </svg>
  );
}

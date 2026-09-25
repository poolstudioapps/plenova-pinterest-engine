"use client";

import { useMemo } from "react";
import { TEAM_META } from "@/lib/versus-stats";
import { compactNumber } from "@/lib/spy-format";

/**
 * The fight poster: Mr Stark on red, Mr Mousk on blue, a torn diagonal between
 * them that sways gently around the middle. The fighters stand still, each in
 * their own half, never overlapping (asked for by the user).
 *
 * Everything moves in CSS (app/globals.css, .vs-*), so it costs nothing to
 * React; reduced motion stills it.
 */

/** Points of the tear: a ragged, powdery edge. Fixed, so it never jumps. */
const RAW_TEAR = Array.from({ length: 34 }, (_, i) => {
  // Two frequencies of jitter: big bites and small crumbs.
  const jitter = Math.sin(i * 2.7) * 1.1 + Math.sin(i * 7.3 + 1) * 0.6 + (i % 5 === 0 ? 1.4 : 0);
  return { t: i / 33, jitter };
});
// Centred: the bites average to nothing, so the tear sits on the middle.
const MEAN_JITTER = RAW_TEAR.reduce((n, p) => n + p.jitter, 0) / RAW_TEAR.length;
const TEAR = RAW_TEAR.map((p) => ({ t: p.t, jitter: p.jitter - MEAN_JITTER }));

/** Where the tear crosses a given height: 56% at the top, 44% at the bottom, 50% halfway. */
const tearX = (t: number) => 56 - 12 * t;

function tearPolygon(offset: number): string {
  const edge = TEAR.map(
    ({ t, jitter }) => `calc(${(tearX(t) + jitter + offset).toFixed(2)}% + var(--vs-sway)) ${(t * 100).toFixed(2)}%`,
  );
  return `polygon(${edge.join(", ")}, 100% 100%, 100% 0%)`;
}

export function VersusHero({
  stark,
  mousk,
  metricLabel,
  metricShort,
  score,
}: {
  stark: number;
  mousk: number;
  metricLabel: string;
  /** The same, in a word, for a phone. */
  metricShort: string;
  score: { stark: number; mousk: number };
}) {
  // The badge sits under the big number, so it follows that number: whoever
  // has more views over the period (asked for by the user). The score under
  // VS says who won more stats.
  const leader = stark === mousk ? null : stark > mousk ? "stark" : "mousk";

  const particles = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        top: (i * 37) % 100,
        size: 3 + ((i * 7) % 6),
        delay: ((i * 0.37) % 3.2).toFixed(2),
        drift: i % 2 === 0 ? -1 : 1,
      })),
    [],
  );

  return (
    <div className="vs-hero relative isolate h-[300px] overflow-hidden rounded-[22px] sm:h-[400px] lg:h-[440px]">
      {/* Red: the whole ground; blue is laid over it. */}
      <div className="vs-red absolute inset-0" />
      {/* Blurred on a wrapper: a clip-path on the same element would cut the blur off. */}
      <div className="vs-blue-powder absolute inset-0">
        <div className="absolute inset-0 bg-[#6f8cff]" style={{ clipPath: tearPolygon(-1.6) }} />
      </div>
      <div className="vs-blue absolute inset-0" style={{ clipPath: tearPolygon(0) }} />
      <div className="vs-grain pointer-events-none absolute inset-0" />
      {/* Darker edges and top, so the names read on any part of the poster. */}
      <div className="vs-vignette pointer-events-none absolute inset-0" />

      {/* Powder thrown off the tear. */}
      {particles.map((p, i) => (
        <span
          key={i}
          className="vs-particle absolute rounded-full"
          style={{
            top: `${p.top}%`,
            left: `calc(${tearX(p.top / 100)}% + var(--vs-sway))`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            ["--vs-drift" as string]: p.drift,
            background: p.drift < 0 ? "#ff3b3b" : "#4d74ff",
          }}
        />
      ))}

      {/* The fighters, still, one per half: sized by width so they can never
          reach across the middle, whatever the screen. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={TEAM_META.stark.image}
        alt="Mr Stark"
        className="absolute bottom-0 left-[-30%] h-auto w-[78%] max-w-none select-none sm:left-[-8%] sm:w-[56%]"
        style={{ filter: `drop-shadow(0 0 22px ${TEAM_META.stark.glow}) drop-shadow(0 22px 26px rgba(0, 0, 0, 0.4))` }}
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={TEAM_META.mousk.image}
        alt="Mr Mousk"
        className="absolute right-[-30%] bottom-0 h-auto w-[78%] max-w-none select-none sm:right-[-8%] sm:w-[56%]"
        style={{ filter: `drop-shadow(0 0 22px ${TEAM_META.mousk.glow}) drop-shadow(0 22px 26px rgba(0, 0, 0, 0.4))` }}
        draggable={false}
      />

      {/* Names and the number that matters - the same build on both sides. */}
      {(
        [
          ["stark", "MR STARK", stark, "left-5 sm:left-8 items-start text-left"],
          ["mousk", "MR MOUSK", mousk, "right-5 sm:right-8 items-end text-right"],
        ] as const
      ).map(([team, name, value, side]) => (
        <div key={team} className={`vs-name absolute top-5 flex flex-col sm:top-7 ${side}`}>
          <p className="vs-title text-[26px] leading-[0.95] text-white sm:text-[50px]">{name}</p>
          <p className="mt-2.5 text-[10.5px] font-semibold tracking-[0.16em] text-white/80 uppercase sm:text-[11.5px]">
            <span className="sm:hidden">{metricShort}</span>
            <span className="hidden sm:inline">{metricLabel}</span>
          </p>
          <p className="vs-title mt-0.5 text-[28px] leading-none text-white tabular-nums sm:text-[40px]">
            {compactNumber(value)}
          </p>
          {leader === team ? (
            <span
              className="vs-leader mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold tracking-[0.12em]"
              title="Plus de vues sur la période"
            >
              <svg viewBox="0 0 16 12" className="h-2.5 w-auto" aria-hidden fill="currentColor">
                <path d="M1 3.5 4.6 6 8 1l3.4 5L15 3.5 13.6 11H2.4z" />
              </svg>
              EN TÊTE
            </span>
          ) : null}
        </div>
      ))}

      {/* VS, cracked: white letters, and the cracks clipped to the same letters on top. */}
      <div className="vs-mark pointer-events-none absolute top-1/2 left-1/2 z-[3] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <div className="relative text-[88px] sm:text-[124px] lg:text-[136px]" role="img" aria-label="VS">
          <span className="vs-letters vs-letters-base" aria-hidden>
            VS
          </span>
          <span className="vs-letters vs-letters-cracks" aria-hidden>
            VS
          </span>
        </div>
        <p
          className="vs-title mt-2 flex w-fit items-center gap-2.5 rounded-full bg-black/55 px-4 py-1 text-[19px] tracking-[0.08em] text-white ring-1 ring-white/15 backdrop-blur-sm sm:text-[22px]"
          title="Stats remportées par chaque équipe"
        >
          <span className="size-2 rounded-full" style={{ background: TEAM_META.stark.color }} />
          {score.stark}
          <span className="text-white/45">-</span>
          {score.mousk}
          <span className="size-2 rounded-full" style={{ background: TEAM_META.mousk.color }} />
        </p>
        <p className="vs-name mt-1.5 text-[10px] font-semibold tracking-[0.18em] text-white/75 uppercase">
          stats gagnées
        </p>
      </div>
    </div>
  );
}

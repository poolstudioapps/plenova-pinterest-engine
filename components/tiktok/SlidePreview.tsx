"use client";

import { useEffect, useRef, useState } from "react";
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  blockLayout,
  renderBlockInner,
  type SlideOverlay,
} from "@/lib/overlay";

interface Props {
  src: string;
  copy: { title: string; subtitle: string; cta?: string };
  overlay: SlideOverlay;
  className?: string;
}

/**
 * A slide as it will look, drawn live rather than waiting for the composite.
 *
 * Burning the text in happens in the browser and only once the page is open,
 * so a thumbnail read straight from the stored image showed a bare photograph
 * whenever that had not happened yet - the words appeared only on opening the
 * editor. Drawing the overlay here means the grid always shows the slide, and
 * it reads the same geometry the capture reads, so it is not a second opinion
 * about what the slide looks like.
 */
export function SlidePreview({ src, copy, overlay, className }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / SLIDE_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const blocks: [string, SlideOverlay["title"]][] = [
    [copy.title, overlay.title],
    [copy.subtitle, overlay.subtitle],
    [copy.cta ?? "", overlay.cta],
  ];

  return (
    <div
      ref={boxRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}`,
        background: "var(--color-line)",
      }}
    >
      <div
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          fontFamily: "'TikTok Sans', system-ui, sans-serif",
          // Nothing is drawn until the box has been measured, so the slide
          // never flashes at full size before shrinking into place.
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        {blocks.map(([text, block], i) =>
          text.trim() ? (
            <div key={i} style={blockLayout(block) as React.CSSProperties}>
              <div
                style={{ width: "100%", textAlign: block.align }}
                dangerouslySetInnerHTML={{
                  __html: renderBlockInner(text, block, overlay.style),
                }}
              />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

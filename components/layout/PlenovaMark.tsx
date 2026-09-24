import Image from "next/image";

/**
 * The Plenova mark, from the app icon itself.
 *
 * The source is a 1024px, 860 KB PNG. Served raw, every page would download
 * the better part of a megabyte to draw a 32px square; through next/image it
 * is resized to the size on screen (twice that, for retina) and re-encoded,
 * which brings it down to a few kilobytes.
 *
 * The image carries its own rounded corners and transparency, so it must not
 * also be rounded or clipped with CSS - that trims the corners unevenly.
 */
export function PlenovaMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/brand/plenova-mark.png"
      alt="Plenova"
      width={size}
      height={size}
      // Above the fold on every page, so it is fetched eagerly.
      priority
      className={className}
    />
  );
}

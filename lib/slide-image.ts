import type { CarouselSlide } from "@/lib/types";

/**
 * Where a slide's bare photograph is read from, through our own origin.
 *
 * The route addresses a slide by its POSITION, and answers with a five-minute
 * cache. Position is not identity: once slides can be reordered, "slide 2" is
 * a different picture after the move, and a browser that cached the old one
 * would keep showing it - worse, the composer reads through the same cache,
 * and would burn slide 2's new words onto slide 2's old photograph and send
 * that to TikTok.
 *
 * So the URL also names which photograph this is. Same picture, same URL,
 * cache used; different picture, different URL, fresh read - and the route
 * resolves the slide by that name, so the bytes are the right ones even when
 * the request races a reorder.
 */
export function slideImageSrc(
  carouselId: string,
  index: number,
  slide: Pick<CarouselSlide, "mediaId" | "imageUrl">,
): string {
  return `/api/carousels/${carouselId}/slides/${index}/raw?photo=${slideFingerprint(slide)}`;
}

/**
 * Which photograph a slide shows, as a short key.
 *
 * The raw route resolves a slide by THIS, not by its position. Position alone
 * raced a reorder: the screen moved the slides at once, the browser asked for
 * "slide 0" before the server had saved the new order, got the old slide 0,
 * and cached that picture under the new slide's URL - the grid showed slide 2's
 * words on slide 1's photograph, and the composer would have published it.
 */
export function slideFingerprint(
  slide: Pick<CarouselSlide, "mediaId" | "imageUrl">,
): string {
  return fingerprint(slide.mediaId ?? slide.imageUrl ?? "");
}

/** A short, stable string hash (FNV-1a), base 36. Not a secret, just a key. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

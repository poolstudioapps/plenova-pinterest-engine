import "server-only";
import { config } from "@/lib/config";
import { notConfigured, upstream } from "@/lib/errors";

/**
 * Pexels search.
 *
 * Used as a *reference* source, never as the published image. A real
 * photograph is handed to the image model, which produces an original frame
 * from it - see reinterpretImage in lib/gemini.ts.
 *
 * The point is the look: images generated from a text prompt alone come out
 * pristine, and pristine reads as AI. Anchoring on a real photograph brings
 * back the domestic mess that makes an image believable - cables on the floor,
 * a chipped pot, a leaf with a brown edge.
 *
 * It also keeps us clear of licensing: nothing from Pexels is republished.
 */

const API = "https://api.pexels.com/v1/search";

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  alt: string;
  /** Large enough to be a useful reference without being wasteful. */
  url: string;
}

interface RawResponse {
  photos?: Array<{
    id: number;
    width: number;
    height: number;
    photographer: string;
    alt: string;
    src?: { large2x?: string; large?: string; original?: string };
  }>;
  error?: string;
}

export function isPexelsConfigured(): boolean {
  return Boolean(config.pexels.apiKey);
}

export async function searchPhotos(
  query: string,
  limit = 5,
): Promise<PexelsPhoto[]> {
  if (!isPexelsConfigured()) {
    throw notConfigured("PEXELS_API_KEY is not set.");
  }

  const url = new URL(API);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(Math.max(1, limit), 20)));
  // Carousels and Pins are both tall, so a portrait reference frames better.
  url.searchParams.set("orientation", "portrait");

  const res = await fetch(url, {
    headers: { Authorization: config.pexels.apiKey! },
    cache: "no-store",
  });

  if (!res.ok) {
    throw upstream(`Pexels search failed (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as RawResponse;
  if (data.error) throw upstream("Pexels rejected the search.", { hint: data.error });

  return (data.photos ?? [])
    .map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      photographer: p.photographer,
      alt: p.alt ?? "",
      url: p.src?.large2x ?? p.src?.large ?? p.src?.original ?? "",
    }))
    .filter((p) => p.url.length > 0);
}

/** Downloads a reference photograph. */
export async function fetchPhoto(photo: PexelsPhoto): Promise<Buffer> {
  const res = await fetch(photo.url, { cache: "no-store" });
  if (!res.ok) {
    throw upstream(`Could not download the reference photograph (HTTP ${res.status}).`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Finds one reference photograph, trying progressively looser queries.
 *
 * A slide brief like "hands checking soil moisture of a monstera" rarely has an
 * exact match; falling back to the broader subject beats failing outright.
 */
export async function findReference(
  queries: string[],
): Promise<{ photo: PexelsPhoto; data: Buffer } | null> {
  for (const query of queries.filter((q) => q.trim().length > 2)) {
    try {
      const results = await searchPhotos(query, 5);
      if (results.length === 0) continue;
      // Pick among the top results rather than always the first, so two slides
      // on a similar subject do not anchor on the same photograph.
      const photo = results[Math.floor(Math.random() * Math.min(3, results.length))]!;
      return { photo, data: await fetchPhoto(photo) };
    } catch {
      // A failing query should fall through to the next, not abort the slide.
    }
  }
  return null;
}

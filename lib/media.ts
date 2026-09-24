import type { PlantIdentity } from "@/lib/data/localize";
import type { MediaAsset, MediaRole } from "@/lib/types";

/**
 * Media library helpers. Kept free of server-only imports so the client can
 * reuse the slug logic when displaying a picker.
 */

/**
 * The one way a searchable string is flattened.
 *
 * It lives here rather than next to the catalog because a client component
 * needs it too: the media library builds its query with it and matches that
 * against a haystack built by the same function. They used to differ - the
 * query was only lowercased while the haystack had its accents stripped - so
 * searching "bégonia", "doré" or "fougère" found nothing at all.
 */
export function normaliseSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalises a free-form cultivar into a safe path segment. */
export function varietySlug(variety: string | null | undefined): string | null {
  if (!variety) return null;
  const slug = variety
    .toLowerCase()
    .normalize("NFD")
    // Strip accents so "panaché" and "panache" land in the same folder.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : null;
}

/**
 * Storage path, organised by plant then cultivar:
 *   media/monstera-deliciosa/variegata/<id>.jpg
 *
 * Deliberately human-browsable - you can open the Blob dashboard and see every
 * image you own for a given plant without querying anything.
 */
export function mediaPath(
  asset: Pick<MediaAsset, "plantSlug" | "varietySlug" | "id">,
  extension: string,
): string {
  const parts = ["media", asset.plantSlug];
  if (asset.varietySlug) parts.push(asset.varietySlug);
  parts.push(`${asset.id}.${extension}`);
  return parts.join("/");
}

/**
 * Resolves a stored asset against the catalog the server handed down.
 *
 * A lookup, not a second naming rule: the rule lives once in `plantIdentity`.
 * The type import above is erased at compile time, so no part of the catalog
 * reaches the browser through this module.
 */
export function identityForAsset(
  asset: Pick<MediaAsset, "plantSlug" | "plantName" | "variety">,
  catalog: Map<string, PlantIdentity>,
): PlantIdentity {
  const known = catalog.get(asset.plantSlug);
  const variety = asset.variety?.trim();
  const cultivar = variety ? `'${variety}'` : null;

  if (known) {
    if (!cultivar) return known;
    return {
      ...known,
      cultivar,
      label:
        `${known.primary} ${cultivar}` +
        (known.latin ? ` (${known.latin})` : ""),
    };
  }

  // Filed under something the catalog does not carry - "unfiled", a cultivar,
  // or a genus the model named on its own. Show what was stored, claim nothing.
  const primary = asset.plantName || asset.plantSlug.replace(/-/g, " ");
  return {
    slug: asset.plantSlug,
    primary,
    latin: null,
    cultivar,
    known: false,
    label: cultivar ? `${primary} ${cultivar}` : primary,
    search: normaliseSearch(`${primary} ${variety ?? ""} ${asset.plantSlug}`),
  };
}

export interface MediaFilter {
  plantSlug?: string;
  varietySlug?: string;
  aspectRatio?: string;
  search?: string;
  limit?: number;
}

export function filterMedia(
  assets: MediaAsset[],
  filter: MediaFilter = {},
): MediaAsset[] {
  let out = assets;
  if (filter.plantSlug) out = out.filter((a) => a.plantSlug === filter.plantSlug);
  if (filter.varietySlug)
    out = out.filter((a) => a.varietySlug === filter.varietySlug);
  if (filter.aspectRatio)
    out = out.filter((a) => a.aspectRatio === filter.aspectRatio);
  if (filter.search) {
    // Accent- and punctuation-insensitive, exactly like the library on screen:
    // the two used to disagree, so /api/media?search=bégonia found nothing.
    const q = normaliseSearch(filter.search);
    out = out.filter(
      (a) =>
        normaliseSearch(`${a.plantName} ${a.variety ?? ""} ${a.prompt}`).includes(q) ||
        a.tags.some((t) => normaliseSearch(t).includes(q)),
    );
  }
  out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return filter.limit ? out.slice(0, filter.limit) : out;
}

/**
 * Groups assets by plant, for a library browsed plant-first.
 *
 * The name it returns is called `fallbackName` rather than `plantName` on
 * purpose: it is whatever was stored when the image was filed, which for pins
 * written in Spanish or German is not even French. It is there to be passed to
 * `identityForAsset` as a last resort, not to be rendered.
 */
export function groupByPlant(
  assets: MediaAsset[],
): { plantSlug: string; fallbackName: string; assets: MediaAsset[] }[] {
  const groups = new Map<string, { fallbackName: string; assets: MediaAsset[] }>();
  for (const asset of assets) {
    const entry = groups.get(asset.plantSlug);
    if (entry) entry.assets.push(asset);
    else
      groups.set(asset.plantSlug, {
        fallbackName: asset.plantName,
        assets: [asset],
      });
  }
  return [...groups.entries()]
    .map(([plantSlug, v]) => ({ plantSlug, ...v }))
    .sort((a, b) => a.fallbackName.localeCompare(b.fallbackName, "fr"));
}

/**
 * Which shelf of the library an image sits on.
 *
 * An explicit role wins. Otherwise an image filed under a species the catalog
 * does not know - "unfiled", a genus the model named on its own, a cultivar -
 * is a hook: a plant nobody can name with confidence is exactly the generic
 * green shot a cover wants, and exactly the wrong thing to file as a specimen.
 *
 * `known` is the set of catalog slugs. It is passed in rather than imported so
 * this stays usable from the client without shipping the catalog.
 */
export type MediaShelf = MediaRole | "species";

export function shelfOf(asset: MediaAsset, known: Set<string>): MediaShelf {
  if (asset.role) return asset.role;
  return known.has(asset.plantSlug) ? "species" : "hook";
}

/**
 * The least-used image of a pool, so one CTA shot does not end up on every
 * carousel while the other two are never seen.
 */
export function leastUsed(pool: MediaAsset[]): MediaAsset | undefined {
  let best: MediaAsset | undefined;
  for (const asset of pool) {
    if (
      !best ||
      asset.usedCount < best.usedCount ||
      (asset.usedCount === best.usedCount &&
        (asset.lastUsedAt ?? "") < (best.lastUsedAt ?? ""))
    ) {
      best = asset;
    }
  }
  return best;
}

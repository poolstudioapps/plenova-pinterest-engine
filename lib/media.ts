import type { MediaAsset } from "@/lib/types";

/**
 * Media library helpers. Kept free of server-only imports so the client can
 * reuse the slug logic when displaying a picker.
 */

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

/** Display label for a plant + cultivar pair. */
export function mediaLabel(asset: MediaAsset): string {
  return asset.variety ? `${asset.plantName} '${asset.variety}'` : asset.plantName;
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
    const q = filter.search.toLowerCase().trim();
    out = out.filter(
      (a) =>
        a.plantName.toLowerCase().includes(q) ||
        (a.variety ?? "").toLowerCase().includes(q) ||
        a.prompt.toLowerCase().includes(q) ||
        a.tags.some((t) => t.includes(q)),
    );
  }
  out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return filter.limit ? out.slice(0, filter.limit) : out;
}

/** Groups assets by plant, for a library browsed plant-first. */
export function groupByPlant(
  assets: MediaAsset[],
): { plantSlug: string; plantName: string; assets: MediaAsset[] }[] {
  const groups = new Map<string, { plantName: string; assets: MediaAsset[] }>();
  for (const asset of assets) {
    const entry = groups.get(asset.plantSlug);
    if (entry) entry.assets.push(asset);
    else groups.set(asset.plantSlug, { plantName: asset.plantName, assets: [asset] });
  }
  return [...groups.entries()]
    .map(([plantSlug, v]) => ({ plantSlug, ...v }))
    .sort((a, b) => a.plantName.localeCompare(b.plantName));
}

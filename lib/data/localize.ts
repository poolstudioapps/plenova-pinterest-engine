import type { ContentAngle, Plant, VisualStyle } from "@/lib/types";
import type { ContentLocale, Locale } from "@/lib/i18n";
import { PLANTS } from "./plants";
import { PLANTS_FR } from "./plants.fr";
import {
  ANGLE_CATEGORY_LABELS_FR,
  ANGLE_LABELS_FR,
  VISUAL_STYLE_LABELS_FR,
} from "./angles.fr";

/**
 * Localization accessors for catalog data. Every lookup falls back to the
 * English value, so a missing translation degrades to English rather than
 * rendering an empty label.
 */

export function plantName(plant: Plant, locale: ContentLocale): string {
  if (locale === "fr") return PLANTS_FR[plant.slug]?.name ?? plant.name;
  return plant.name;
}

/** Alternative common names in the target locale, for SEO breadth. */
export function plantAka(plant: Plant, locale: ContentLocale): string[] {
  if (locale === "fr") return PLANTS_FR[plant.slug]?.aka ?? [];
  return [];
}

export function angleLabel(angle: ContentAngle, locale: Locale): string {
  if (locale === "fr") return ANGLE_LABELS_FR[angle.slug] ?? angle.label;
  return angle.label;
}

export function angleCategoryLabel(category: string, locale: Locale): string {
  if (locale === "fr") return ANGLE_CATEGORY_LABELS_FR[category] ?? category;
  const map: Record<string, string> = {
    care: "Care",
    problems: "Problems",
    mistakes: "Mistakes",
    discovery: "Discovery / SEO",
    seasonal: "Seasonal",
  };
  return map[category] ?? category;
}

export function visualStyleLabel(style: VisualStyle, locale: Locale): string {
  if (locale === "fr") return VISUAL_STYLE_LABELS_FR[style.slug] ?? style.label;
  return style.label;
}


/**
 * Matches a free-form plant name against the catalog.
 *
 * Slides in a listicle each show a DIFFERENT plant, and the model names them
 * however it likes - "Sansevieria", "langue de belle-mère", "Dracaena
 * trifasciata" are all the same species. Filing every image under the
 * carousel's primary plant, or under a generic bucket, made the library
 * unusable for attribution and reuse.
 *
 * Returns the catalog slug when a species is recognised, otherwise a slug of
 * the name itself - a cultivar the catalog does not carry is still worth
 * filing under its own name.
 */
export function matchPlantSlug(name: string): string | null {
  const needle = normalise(name);
  if (!needle) return null;

  for (const plant of PLANTS) {
    const candidates = [
      plant.slug,
      plant.name,
      plant.scientificName ?? "",
      PLANTS_FR[plant.slug]?.name ?? "",
      ...(PLANTS_FR[plant.slug]?.aka ?? []),
    ].map(normalise);

    // Exact match first, then containment, so "monstera deliciosa in a pot"
    // still resolves but "monstera" does not silently claim "monstera adansonii".
    if (candidates.some((c) => c && c === needle)) return plant.slug;
  }
  for (const plant of PLANTS) {
    const candidates = [
      plant.name,
      plant.scientificName ?? "",
      PLANTS_FR[plant.slug]?.name ?? "",
      ...(PLANTS_FR[plant.slug]?.aka ?? []),
    ].map(normalise);
    if (candidates.some((c) => c && (needle.includes(c) || c.includes(needle)))) {
      return plant.slug;
    }
  }

  return slugify(name);
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalise(value).replace(/\s+/g, "-").slice(0, 50);
}

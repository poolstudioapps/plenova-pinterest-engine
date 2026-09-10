import type { ContentAngle, Plant, VisualStyle } from "@/lib/types";
import type { ContentLocale, Locale } from "@/lib/i18n";
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

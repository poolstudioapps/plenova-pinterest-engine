import type { ContentAngle, Plant, VisualStyle } from "@/lib/types";
import type { ContentLocale } from "@/lib/i18n";
import { normaliseSearch } from "@/lib/media";
import { PLANTS, PLANTS_BY_SLUG } from "./plants";
import { PLANTS_FR } from "./plants.fr";
import {
  ANGLE_CATEGORY_LABELS_FR,
  ANGLE_LABELS_FR,
  VISUAL_STYLE_LABELS_FR,
} from "./angles.fr";

/**
 * Localization accessors for catalog data.
 *
 * Two different audiences read these. The interface is French only, so the
 * angle and style labels take no locale at all. A plant NAME still does, and
 * must: the same carousel is written in five languages, and each one needs the
 * species named the way its own readers say it.
 *
 * Every lookup falls back to the English catalog value, so a missing
 * translation degrades to English rather than rendering an empty label.
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

/**
 * A plant named twice: the way you think of it, and the way it is classified.
 *
 * The library groups images by species, and a common name alone is not enough
 * to be sure which one you are looking at - "Pilea" is a genus of six hundred
 * species, and the one everybody means is Pilea peperomioides. Carrying both
 * names is what makes an image reusable with any confidence.
 *
 * Built once, on the server, and handed to the client as data: this module
 * pulls in the whole catalog, care text and all, which has no business in a
 * browser bundle.
 */
export interface PlantIdentity {
  slug: string;
  /** What the operator thinks in - the common name in their language. */
  primary: string;
  /** The botanical name, or null when it would only repeat `primary`. */
  latin: string | null;
  /** Cultivar epithet, already in botanical quotes: "'Thai Constellation'". */
  cultivar: string | null;
  /** False when no catalog entry backs this slug - see `plantIdentity`. */
  known: boolean;
  /** One-line form, for <option>, alt text and title attributes. */
  label: string;
  /** Normalised haystack, so searching the latin name or an alias works. */
  search: string;
}

/**
 * Resolves a slug into both names.
 *
 * Accepts a stored record as readily as a catalog entry, because images are
 * not all filed under a species the catalog carries: a carousel slide is filed
 * under whatever the model called the plant, which may be a cultivar, a genus,
 * or nothing recognisable at all.
 *
 * When the slug is unknown the stored name is shown alone and `known` is
 * false. It never invents a botanical name - a fabricated latin name is worse
 * than none, since the whole point of showing one is to be certain.
 */
export function plantIdentity(
  input: { slug: string; fallbackName?: string | null; variety?: string | null },
  locale: ContentLocale = "fr",
): PlantIdentity {
  const plant = PLANTS_BY_SLUG.get(input.slug);
  const primary = plant
    ? plantName(plant, locale)
    : (input.fallbackName?.trim() || input.slug.replace(/-/g, " "));

  /*
   * One line or two, decided on the normalised forms.
   *
   * Eight of the fifty species are commonly called by their botanical name -
   * "Monstera deliciosa" is both - and printing that twice is noise. The
   * comparison ignores case, accents and quotes so "Bégonia maculata" and
   * "Philodendron 'Birkin'" collapse too. It is deliberately an equality and
   * never a containment: "Pilea" inside "Pilea peperomioides" is exactly the
   * species epithet the operator needs to see.
   */
  const scientific = plant?.scientificName ?? null;
  const latin =
    scientific && normalise(scientific) !== normalise(primary) ? scientific : null;

  const variety = input.variety?.trim();
  const cultivar = variety ? `'${variety}'` : null;

  const label =
    [primary, cultivar].filter(Boolean).join(" ") + (latin ? ` (${latin})` : "");

  const search = normaliseSearch(
    [
      primary,
      latin ?? "",
      ...(plant ? plantAka(plant, locale) : []),
      variety ?? "",
      input.slug,
    ].join(" "),
  );

  return {
    slug: input.slug,
    primary,
    latin,
    cultivar,
    known: plant !== undefined,
    label,
    search,
  };
}

export function angleLabel(angle: ContentAngle): string {
  return ANGLE_LABELS_FR[angle.slug] ?? angle.label;
}

export function angleCategoryLabel(category: string): string {
  return ANGLE_CATEGORY_LABELS_FR[category] ?? category;
}

export function visualStyleLabel(style: VisualStyle): string {
  return VISUAL_STYLE_LABELS_FR[style.slug] ?? style.label;
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
    /*
     * Only ever the needle containing a full catalog name, never the reverse.
     *
     * The other direction let a bare genus claim the first species carrying
     * it: "Monstera" matched "monstera deliciosa" and every such slide was
     * filed - and, once both names are on screen, LABELLED - as M. deliciosa,
     * which nobody had established. An unrecognised genus now falls through to
     * its own slug and is shown without a botanical name, which is the honest
     * answer.
     */
    if (candidates.some((c) => c && needle.includes(c))) {
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

import type { VisualStyle } from "@/lib/types";

/**
 * Visual formats (spec §11). Pinterest must never receive a thousand copies of
 * one template, so every Pin picks a style and the style rewrites the whole
 * composition brief - not just a filter on top of the same photo.
 *
 * `direction` is injected verbatim into the image prompt.
 */
export const VISUAL_STYLES: VisualStyle[] = [
  {
    slug: "editorial-photo",
    label: "Editorial plant photo",
    direction:
      "Full-frame editorial interior photograph. The plant is the hero, styled in a real, beautifully designed room. Shot on a 35mm lens at f/2.8, natural window light, magazine-quality colour grading.",
  },
  {
    slug: "close-up-detail",
    label: "Close-up detail",
    direction:
      "Extreme macro detail of the foliage filling most of the frame. 100mm macro lens, very shallow depth of field, visible leaf texture and venation, softly blurred background.",
  },
  {
    slug: "typography-overlay",
    label: "Plant + typography overlay",
    direction:
      "Editorial plant photograph composed with deliberate empty negative space in the upper third, reserved for a short elegant text overlay. Clean modern sans-serif typography, high contrast against the background, generous margins, no more than six words.",
    hasTypography: true,
  },
  {
    slug: "before-after",
    label: "Before / after",
    direction:
      "A clean two-panel vertical split composition. Top panel shows the struggling plant, bottom panel the same plant recovered and healthy. Identical framing, pot and background in both panels so the difference reads instantly. A thin neutral divider separates them.",
  },
  {
    slug: "problem-focused",
    label: "Problem-focused",
    direction:
      "Documentary-style diagnostic photograph isolating the specific symptom. Neutral, slightly clinical lighting, uncluttered background, the affected area sharp and centred.",
  },
  {
    slug: "step-by-step",
    label: "Step-by-step visual",
    direction:
      "A vertical stack of three or four evenly sized panels, each showing one sequential step of the task. Consistent lighting, background and framing across panels, subtle numbering in a small clean typeface.",
    hasTypography: true,
  },
  {
    slug: "checklist",
    label: "Checklist",
    direction:
      "A calm, minimal photograph of the plant on the left third with a clean vertical checklist laid out over the right two thirds. Simple check icons, short lines of text, plenty of whitespace, muted neutral background panel.",
    hasTypography: true,
  },
  {
    slug: "minimal-infographic",
    label: "Minimal infographic",
    direction:
      "An elegant minimal infographic card. A cleanly cut-out illustration or photograph of the plant sits centre, surrounded by two or three small labelled icon callouts for light, water and humidity. Flat muted palette, thin strokes, lots of whitespace, no clutter.",
    hasTypography: true,
  },
  {
    slug: "plant-in-interior",
    label: "Plant in interior",
    direction:
      "Wide interior lifestyle shot. The plant sits within a fully styled, inhabited room - furniture, textiles and daylight all visible. Warm, natural, aspirational but believable.",
  },
  {
    slug: "care-card",
    label: "Plant care card",
    direction:
      "A premium care-card layout. Large plant photograph occupies the top two thirds; the lower third is a clean card panel with the plant name and three or four short care lines set in refined typography. Soft neutral palette, subtle rounded corners.",
    hasTypography: true,
  },
];

export const VISUAL_STYLES_BY_SLUG = new Map(
  VISUAL_STYLES.map((s) => [s.slug, s]),
);

export function getVisualStyle(slug: string): VisualStyle | undefined {
  return VISUAL_STYLES_BY_SLUG.get(slug);
}

/**
 * Style affinities per angle category. Picking a style at random produces
 * nonsense pairings (a "before / after" layout for a discovery Pin), so each
 * category gets a weighted-sensible shortlist.
 */
const STYLE_AFFINITY: Record<string, string[]> = {
  care: [
    "editorial-photo",
    "care-card",
    "minimal-infographic",
    "checklist",
    "plant-in-interior",
    "step-by-step",
  ],
  problems: [
    "problem-focused",
    "close-up-detail",
    "before-after",
    "editorial-photo",
    "minimal-infographic",
  ],
  mistakes: [
    "checklist",
    "typography-overlay",
    "before-after",
    "problem-focused",
    "minimal-infographic",
  ],
  discovery: [
    "plant-in-interior",
    "editorial-photo",
    "typography-overlay",
    "care-card",
  ],
  seasonal: [
    "editorial-photo",
    "plant-in-interior",
    "close-up-detail",
    "care-card",
    "typography-overlay",
  ],
};

/**
 * Deterministically picks a style for a plant+angle+variation triple.
 *
 * Deterministic rather than random so the same combination always resolves to
 * the same style - which is what makes the dedupe key meaningful, and makes a
 * regenerate reproducible.
 */
export function pickVisualStyle(
  angleCategory: string,
  seed: number,
): VisualStyle {
  const pool = STYLE_AFFINITY[angleCategory] ?? VISUAL_STYLES.map((s) => s.slug);
  const slug = pool[Math.abs(seed) % pool.length]!;
  return getVisualStyle(slug) ?? VISUAL_STYLES[0]!;
}

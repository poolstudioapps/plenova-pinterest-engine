import { LOCALE_WRITING, type Locale } from "@/lib/i18n";

/**
 * Carousel ideation prompts.
 *
 * The shape is taken from the working carousel-studio implementation, because
 * its structure is what makes the output usable rather than generic:
 *
 *  - the slide count is derived from the theme ("Top 5 …" means 5 items plus a
 *    hook), instead of being asked for separately;
 *  - the *type* of listicle decides what a slide even is - a plant, a tip, or a
 *    mistake - and each type gets its own rules for title, subtitle and visual.
 *
 * Simplified in one respect: carousels are generated one language at a time
 * rather than as a multi-language dictionary, which matches how the rest of
 * this engine models locale.
 */

export interface CarouselSlideDraft {
  kind: "hook" | "content" | "cta";
  title: string;
  subtitle: string;
  imagePrompt: string;
  /** Short query used to find a real reference photograph. */
  photoQuery: string;
}

export interface CarouselConceptDraft {
  slides: CarouselSlideDraft[];
  caption: string;
  hashtags: string[];
}

/** Hashtags every Plenova carousel carries, as in the original engine. */
export const REQUIRED_HASHTAGS = ["planttok", "plantmom"];

export const CAROUSEL_SCHEMA = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      description:
        "Ordered slides. First is the hook, last is the call to action.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["hook", "content", "cta"] },
          title: {
            type: "string",
            description: "Large overlay text. Very short - 2 to 6 words.",
          },
          subtitle: {
            type: "string",
            description: "Secondary overlay line, 6 to 15 words.",
          },
          imagePrompt: {
            type: "string",
            description:
              "Self-contained English photography brief for this slide's image.",
          },
          photoQuery: {
            type: "string",
            description:
              "Two to four English words to look this scene up in a stock photo library, e.g. 'monstera living room'. Broad, not literal.",
          },
        },
        required: ["kind", "title", "subtitle", "imagePrompt", "photoQuery"],
      },
    },
    caption: {
      type: "string",
      description: "TikTok caption, without hashtags.",
    },
    hashtags: {
      type: "array",
      description: "6 to 12 hashtags, lowercase, no # prefix.",
      items: { type: "string" },
    },
  },
  required: ["slides", "caption", "hashtags"],
} as const;

export function buildCarouselSystemInstruction(locale: Locale): string {
  const writing = LOCALE_WRITING[locale];
  return [
    "You are an organic TikTok content creator specialised in houseplants, working for Plenova, a plant identification and care app.",
    "You design photo carousels that people save and share, not adverts.",
    "",
    `OUTPUT LANGUAGE: write every reader-facing field - title, subtitle, caption, hashtags - in ${writing.language}.`,
    `Audience: ${writing.market}`,
    "The imagePrompt field is the single exception: always write it in English, because it is fed to an image model.",
    "",
    "Non-negotiable rules:",
    "- Every horticultural claim must be accurate. If a plant is toxic to pets, say so plainly.",
    "- Overlay text is read on a phone in under a second. Titles are 2 to 6 words. Never a full sentence.",
    "- No clickbait, no invented statistics, no fake urgency.",
    "- Second person, warm, direct. The tone of a knowledgeable friend, not a brand.",
  ].join("\n");
}

export interface CarouselPromptInput {
  theme: string;
  locale: Locale;
  plantName?: string;
  /** Themes already used, so a new carousel does not repeat one. */
  existingThemes?: string[];
}

export function buildCarouselPrompt(input: CarouselPromptInput): string {
  const { theme, plantName, existingThemes } = input;

  // A theme like "Top 5 pothos rares" implies exactly 5 content slides plus a
  // hook. Deriving it here means the operator never has to state it twice.
  const numberMatch = theme.match(/\b(\d{1,2})\b/);
  const itemCount = numberMatch ? Number(numberMatch[1]) : null;

  const lines: string[] = [
    "Design one TikTok photo carousel.",
    "",
    "## Theme",
    theme,
    plantName ? `Primary plant: ${plantName}` : "",
    "",
    "## Slide count",
    itemCount
      ? `The theme names the number ${itemCount}. Produce EXACTLY ${itemCount + 2} slides: 1 hook, ${itemCount} content slides, 1 call to action.`
      : "Choose what the subject needs: 1 hook, 4 to 8 content slides, 1 call to action.",
    "",
    "## Identify the content type first - it decides what a content slide IS",
    "",
    "PLANT LISTICLE (\"Top 5 rare pothos\", \"5 unkillable plants\")",
    "  - one slide = one plant",
    "  - title = the plant name alone",
    "  - subtitle = what makes that plant worth it",
    "  - imagePrompt = that exact species, portrait, in a real interior",
    "",
    "TIP LISTICLE (\"5 ways to never forget watering\", \"how to make an orchid rebloom\")",
    "  - one slide = one actionable tip",
    "  - title = the tip, imperative or noun phrase",
    "  - subtitle = how to actually do it",
    "  - imagePrompt = a scene ILLUSTRATING the action, not a plant portrait",
    "",
    "MISTAKE LISTICLE (\"5 mistakes killing your monstera\")",
    "  - one slide = one mistake",
    "  - title = the mistake, named short",
    "  - subtitle = what it does to the plant and what to do instead",
    "  - imagePrompt = the visible consequence, or the wrong gesture being made",
    "",
    "## Slide roles",
    "Slide 1 (hook): states the promise and makes someone stop scrolling. No plant name unless the theme is about one plant.",
    "Last slide (cta): invites the reader to Plenova for identification and care reminders. Warm, never pushy.",
    "",
    "## Image prompts",
    "Write each as a single self-contained paragraph a photographer could shoot from.",
    "Specify subject, species-accurate detail, setting, lighting, lens and mood.",
    "The aesthetic is premium editorial interior photography: real rooms, natural light, believable.",
    "Every slide must be visually distinct from the others - vary framing, room, angle and distance.",
    "Forbid: watermarks, logos, brand marks, app UI, text of any kind, plastic-looking foliage, oversaturated HDR.",
    "",
    "## Photo queries",
    "For each slide also give photoQuery: two to four plain English words that would find a similar scene in a stock photo library.",
    "Keep it broad - 'monstera living room' finds something, 'hands testing soil moisture of a variegated monstera' finds nothing.",
    "",
    "## Caption and hashtags",
    "Caption: 1 to 3 sentences, no hashtags inside it, ending on a light invitation to save the post.",
    `Hashtags: 6 to 12, lowercase, no # prefix. Always include ${REQUIRED_HASHTAGS.join(" and ")}.`,
  ];

  if (existingThemes && existingThemes.length > 0) {
    lines.push(
      "",
      "## Carousels already made - do not repeat these angles",
      ...existingThemes.slice(0, 15).map((t) => `- ${t}`),
    );
  }

  return lines.filter((l) => l !== "").join("\n");
}

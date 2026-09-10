import {
  CONTENT_LOCALE_LABELS,
  LOCALE_WRITING,
  type ContentLocale,
} from "@/lib/i18n";

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
 * Every text field comes back as a dictionary keyed by language, so one
 * generation run feeds every connected account at once. Asking the model for
 * all languages together also keeps them consistent: the same idea, adapted,
 * rather than five independent takes that drift apart.
 */

/** A text field in every requested language. */
export type MultiText = Partial<Record<ContentLocale, string>>;

export interface CarouselSlideDraft {
  kind: "hook" | "content" | "cta";
  title: MultiText;
  subtitle: MultiText;
  imagePrompt: string;
  /** Short query used to find a real reference photograph. */
  photoQuery: string;
  /** The species shown on this slide, so the image can be filed correctly. */
  plantTag: string;
}

export interface CarouselConceptDraft {
  slides: CarouselSlideDraft[];
  /**
   * 1-based position of the content slide carrying the mid-carousel Plenova
   * mention. Never the hook or the call to action.
   */
  midCtaIndex: number;
  caption: MultiText;
  hashtags: Partial<Record<ContentLocale, string[]>>;
}

/** Hashtags every Plenova carousel carries, as in the original engine. */
export const REQUIRED_HASHTAGS = ["planttok", "plantmom"];

/**
 * Built per request rather than declared once, because the required language
 * keys change with the selection. Marking each language `required` is what
 * stops the model quietly dropping Italian from slide four.
 */
export function carouselSchema(languages: ContentLocale[]) {
  const multiText = (description: string) => ({
    type: "object",
    description,
    properties: Object.fromEntries(
      languages.map((l) => [l, { type: "string" }]),
    ),
    required: [...languages],
  });

  return {
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
            title: multiText("Large overlay text. Very short - 2 to 6 words."),
            subtitle: multiText("Secondary overlay line, 6 to 15 words."),
            imagePrompt: {
              type: "string",
              description:
                "Self-contained English photography brief for this slide's image.",
            },
            photoQuery: {
              type: "string",
              description:
                "Two to four English words to look this scene up in a stock photo library.",
            },
            plantTag: {
              type: "string",
              description:
                "The botanical or common English name of the ONE plant shown on this slide, e.g. 'Monstera deliciosa'. Empty only if no specific plant appears.",
            },
          },
          required: [
            "kind",
            "title",
            "subtitle",
            "imagePrompt",
            "photoQuery",
            "plantTag",
          ],
        },
      },
      midCtaIndex: {
        type: "integer",
        description:
          "1-based position of the content slide whose subtitle carries the Plenova mention. Must be a content slide - never the first or the last.",
      },
      caption: multiText("TikTok caption, without hashtags."),
      hashtags: {
        type: "object",
        description: "6 to 12 hashtags per language, lowercase, no # prefix.",
        properties: Object.fromEntries(
          languages.map((l) => [
            l,
            { type: "array", items: { type: "string" } },
          ]),
        ),
        required: [...languages],
      },
    },
    required: ["slides", "midCtaIndex", "caption", "hashtags"],
  };
}

export function buildCarouselSystemInstruction(
  languages: ContentLocale[],
): string {
  const list = languages
    .map((l) => `${l} (${LOCALE_WRITING[l].language})`)
    .join(", ");

  return [
    "You are an organic TikTok content creator specialised in houseplants, working for Plenova, a plant identification and care app.",
    "You design photo carousels that people save and share, not adverts.",
    "",
    `LANGUAGES: every reader-facing field - title, subtitle, caption, hashtags - must be returned as a dictionary containing ALL of: ${list}.`,
    "No language may be missing from any field. A missing key breaks the account that publishes in it.",
    "",
    "Adapt rather than translate. Each version must read as though written by a native speaker for their own market:",
    ...languages.map((l) => `- ${LOCALE_WRITING[l].language}: ${LOCALE_WRITING[l].market}`),
    "Hashtags especially are not translations - they are the tags people actually use in that language.",
    "",
    "The imagePrompt and photoQuery fields are the exceptions: always English, because they feed an image model and a stock photo search.",
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
  languages: ContentLocale[];
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
    "## The mid-carousel mention",
    "Exactly ONE content slide - never the first, never the last - must also mention Plenova, and you choose which in midCtaIndex.",
    "It belongs at the end of that slide's subtitle, in one short clause, and it has to earn its place: tie it to what that slide is actually about.",
    "Good: a watering slide ending 'Plenova te rappelle quand arroser.' Bad: 'Télécharge Plenova !' bolted onto a slide about leaf shape.",
    "Pick the slide where the app genuinely helps with that specific problem. If nothing fits naturally, pick the middle slide and keep the mention very light.",
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
    "## Plant tag",
    "For each slide give plantTag: the botanical or common English name of the single plant that slide shows.",
    "On a plant listicle this differs on every slide - that is the point, it is how each image gets filed under the right species.",
    "Leave it empty only when no specific plant appears in the frame.",
    "",
    "## Caption and hashtags",
    "Caption: 1 to 3 sentences, no hashtags inside it, ending on a light invitation to save the post.",
    `Hashtags: 6 to 12 per language, lowercase, no # prefix. Always include ${REQUIRED_HASHTAGS.join(" and ")} in every language.`,
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

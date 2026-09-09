import type { ContentAngle, Plant, VisualStyle } from "@/lib/types";
import { LOCALE_WRITING, type Locale } from "@/lib/i18n";
import { plantAka, plantName } from "@/lib/data/localize";
import { PINTEREST_LIMITS } from "@/lib/utils";

/**
 * Prompt construction lives here, separate from the Gemini client (spec §24),
 * so copy quality can be iterated without touching transport code.
 */

/**
 * Variation is the mechanism that stops 1,000 Pins reading like one Pin
 * (spec §18). Appending a number to a title is explicitly called out as wrong,
 * so each variation instead selects a different *rhetorical structure*. The
 * model is told to commit to one archetype completely.
 */
const HOOK_ARCHETYPES = [
  {
    name: "Numbered diagnostic",
    brief:
      "Lead with a specific count of causes, checks or steps. The number must be honest and match how many items the description actually implies. Example shape: '7 Reasons Your <plant> Has <symptom>'.",
  },
  {
    name: "Direct question",
    brief:
      "Open with the exact question a worried owner would type into Pinterest search. Keep it short and conversational. Example shape: 'How Often Should You Water a <plant>?'",
  },
  {
    name: "Definitive guide",
    brief:
      "Position the Pin as the complete, authoritative reference on the topic. Calm and confident, no hype. Example shape: 'The Complete <plant> Care Guide'.",
  },
  {
    name: "Pattern interrupt",
    brief:
      "Interrupt a common mistake the reader is probably about to make, then promise the correction. Example shape: 'Before You Cut Those Yellow <plant> Leaves...'.",
  },
  {
    name: "Symptom-first",
    brief:
      "Name the visible symptom first, then promise the diagnosis. Example shape: '<plant> Yellow Leaves? Check These 5 Things'.",
  },
  {
    name: "Myth correction",
    brief:
      "Name a widespread piece of bad advice and correct it. Stay factual, never smug. Example shape: 'Stop Misting Your <plant> - Do This Instead'.",
  },
] as const;

export function hookArchetype(variation: number) {
  const idx = Math.abs(variation) % HOOK_ARCHETYPES.length;
  return HOOK_ARCHETYPES[idx]!;
}

/** JSON Schema for the copy call. Enforced by the model, not by us parsing prose. */
export const PIN_COPY_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: `Pinterest Pin title, max ${PINTEREST_LIMITS.titleMax} characters.`,
    },
    description: {
      type: "string",
      description: `Pinterest Pin description, 150-400 characters, ending with a natural CTA toward Plenova.`,
    },
    keywords: {
      type: "array",
      description: "5 to 12 lowercase Pinterest search keywords.",
      items: { type: "string" },
    },
    altText: {
      type: "string",
      description:
        "Plain accessible description of the image for screen readers, max 400 characters.",
    },
    imagePrompt: {
      type: "string",
      description:
        "A complete, self-contained image generation prompt describing the exact photograph to produce.",
    },
  },
  required: ["title", "description", "keywords", "altText", "imagePrompt"],
} as const;

export interface CopyPromptInput {
  plant: Plant;
  angle: ContentAngle;
  style: VisualStyle;
  variation: number;
  /** Language the Pin copy must be written in. */
  locale: Locale;
  customAngle?: string;
  /** Titles already generated for this plant, so the model can avoid them. */
  existingTitles?: string[];
}

/** Filler words that read as AI-written, banned from titles per language. */
const BANNED_TITLE_WORDS: Record<Locale, string> = {
  en: "'unlock', 'game-changer', 'ultimate', 'secret', 'hack', 'thriving'",
  fr: "« secret », « astuce ultime », « incontournable », « révolutionnaire », « boostez »",
};

export function buildSystemInstruction(locale: Locale): string {
  const writing = LOCALE_WRITING[locale];
  return [
    "You are the content lead for Plenova, a houseplant care app.",
    "You write Pinterest Pins that earn saves because they are genuinely useful, not because they bait clicks.",
    "",
    `OUTPUT LANGUAGE: write every reader-facing field (title, description, keywords, altText) in ${writing.language}.`,
    `Audience: ${writing.market}`,
    "The imagePrompt field is the single exception: always write it in English, because it is fed to an image model.",
    locale !== "en"
      ? `Compose directly in ${writing.language} as a native speaker would - never translate an English sentence structure. The keywords especially must be terms people genuinely type into Pinterest in that language, not translated English phrases.`
      : "",
    "",
    "Non-negotiable rules:",
    "- Every horticultural claim must be accurate. If a plant is toxic to pets, say so plainly; never soften it.",
    "- No clickbait, no fake urgency, no invented statistics, no fake authority.",
    "- No keyword stuffing. Keywords belong inside natural sentences.",
    "- At most one emoji, and only when it genuinely helps. Usually use none.",
    `- Never use these words in the title: ${BANNED_TITLE_WORDS[locale]}.`,
    "- Second person, warm but not cutesy.",
    "- The reader is a real person whose plant is struggling. Respect their time.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildCopyPrompt(input: CopyPromptInput): string {
  const { plant, angle, style, variation, locale, customAngle, existingTitles } =
    input;
  const archetype = hookArchetype(variation);
  const localName = plantName(plant, locale);
  const aka = plantAka(plant, locale);

  const lines: string[] = [
    "Generate one Pinterest Pin.",
    "",
    "## Plant",
    `Name to use in the copy: ${localName}`,
    plant.name !== localName ? `English reference name: ${plant.name}` : "",
    aka.length > 0
      ? `Other common names in this language you may use naturally: ${aka.join(", ")}`
      : "",
    plant.scientificName ? `Botanical name: ${plant.scientificName}` : "",
    `Difficulty: ${plant.difficulty}`,
    `Light: ${plant.light}`,
    `Watering: ${plant.watering}`,
    plant.humidity ? `Humidity: ${plant.humidity}` : "",
    plant.seasonalNotes ? `Seasonal note: ${plant.seasonalNotes}` : "",
    `Common problems: ${plant.commonProblems.join(", ")}`,
    typeof plant.petFriendly === "boolean"
      ? `Pet safety: ${plant.petFriendly ? "considered non-toxic to cats and dogs" : "toxic if ingested by cats or dogs - state this honestly if the angle touches pets"}`
      : "",
    "",
    "## Content angle",
    `Angle: ${angle.label}`,
    `Search intent to satisfy: ${angle.intent}`,
    customAngle ? `Additional user direction (highest priority): ${customAngle}` : "",
    "",
    "## Required title structure",
    `Archetype: ${archetype.name}`,
    archetype.brief,
    "Commit fully to this archetype. Do not blend it with another, and never append a number or 'v2' to differentiate.",
    "",
    "## Visual format this Pin will use",
    `Format: ${style.label}`,
    `Composition brief: ${style.direction}`,
    style.hasTypography
      ? "This format carries text inside the image. Your imagePrompt MUST specify the exact short words to render, in quotes, and state that spelling must be exact."
      : "This format carries no text. Your imagePrompt MUST explicitly forbid any text, letters, watermarks or logos in the image.",
    "",
    "## Image prompt requirements",
    `Base scene direction: ${angle.sceneDirection}`,
    plant.visualTraits
      ? `The plant must be botanically recognisable: ${plant.visualTraits}. Describe these traits explicitly so the render is the correct species.`
      : "",
    "Write imagePrompt as a single self-contained paragraph a photographer could shoot from.",
    "Specify: subject, species-accurate detail, setting, lighting, lens/depth of field, palette and mood.",
    "The aesthetic is premium editorial interior photography: real, warm, natural light, believable rooms.",
    "Forbid: watermarks, logos, brand marks, app UI, distorted leaves, plastic-looking foliage, oversaturated HDR.",
    "",
    "## Copy requirements",
    `Title: max ${PINTEREST_LIMITS.titleMax} characters. Front-load the plant name and the search term.`,
    "Description: 150-400 characters. Say what the reader will learn, weave in 2-3 keywords naturally, and close with a single natural sentence pointing to Plenova for reminders and care schedules. Vary this closing sentence - it must not be identical across Pins.",
    "Keywords: 5-12 lowercase phrases people actually search on Pinterest. They must match the Pin's real content.",
    "altText: describe the image plainly for a screen reader. No marketing language.",
  ];

  if (existingTitles && existingTitles.length > 0) {
    lines.push(
      "",
      "## Titles already used for this plant - yours must be clearly different in structure and wording",
      ...existingTitles.slice(0, 15).map((t) => `- ${t}`),
    );
  }

  return lines.filter((l) => l !== "").join("\n");
}

/**
 * Final image prompt. The model-authored `imagePrompt` carries the creative
 * brief; this wrapper enforces the invariants that must hold on every single
 * Pin regardless of what the copy model wrote (spec §10).
 */
export function buildImagePrompt(
  imagePrompt: string,
  style: VisualStyle,
): string {
  return [
    imagePrompt.trim(),
    "",
    "Technical direction:",
    "- Vertical 2:3 composition designed for a Pinterest feed.",
    "- Photorealistic, premium editorial quality, natural light, believable interior.",
    "- Sharp focus on the plant, accurate leaf shape and colour for the species.",
    "- No watermark, no logo, no brand mark, no app interface, no border, no frame.",
    style.hasTypography
      ? "- Any text in the image must be spelled exactly as specified, set in a clean modern sans-serif, and be comfortably readable at thumbnail size."
      : "- Absolutely no text, letters, numbers, captions or labels anywhere in the image.",
  ].join("\n");
}

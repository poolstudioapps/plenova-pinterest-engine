import "server-only";
import { GoogleGenAI } from "@google/genai";
import { config } from "@/lib/config";
import { upstream } from "@/lib/errors";
import type { ContentLocale } from "@/lib/i18n";
import { LOCALE_WRITING } from "@/lib/i18n";
import { creatorVoice, voiceRegister } from "@/lib/voice";

/**
 * Reposting: an existing carousel, rebuilt as our own.
 *
 * The operator supplies screenshots. That is a deliberate choice rather than a
 * limitation: pulling someone else's posts down automatically is against
 * TikTok's terms, and this app is in front of their reviewers. A screenshot is
 * something a person already has on screen.
 *
 * Each screenshot goes through two model calls.
 *
 *  1. Read it. What does the overlay say, where does it sit, what is actually
 *     in the photograph. The words come back in every requested language, so
 *     one screenshot feeds every account.
 *
 *  2. Clean it. The result must be the SAME photograph with the app's
 *     furniture and the original overlay removed - not a remix. Asking for a
 *     variation gives a different plant, which is worse than useless when the
 *     post is about that plant.
 */

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (!config.gemini.apiKey) {
    throw upstream("Il manque la clé GEMINI_API_KEY, rien ne peut être lu.");
  }
  client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return client;
}

export interface ReadSlide {
  /** The language the original was written in, as the model read it. */
  detectedLocale: string;
  title: Partial<Record<ContentLocale, string>>;
  subtitle: Partial<Record<ContentLocale, string>>;
  cta: Partial<Record<ContentLocale, string>>;
  placement: "top" | "center" | "bottom";
  /** What the photograph shows, in English, for filing and for prompts. */
  visualSummary: string;
  hasPerson: boolean;
}

function textSchema(languages: ContentLocale[]) {
  return {
    type: "object",
    properties: Object.fromEntries(languages.map((l) => [l, { type: "string" }])),
    required: [...languages],
  };
}

/** Reads one screenshot: the words, where they sit, and what is in frame. */
export async function readScreenshot(
  image: { data: Buffer; mimeType: string },
  languages: ContentLocale[],
): Promise<ReadSlide> {
  const written = languages
    .map((l) => `${l} (${LOCALE_WRITING[l].language})`)
    .join(", ");

  const prompt = [
    "This is a screenshot of one slide of a TikTok photo carousel.",
    "",
    "Read the overlay text that was placed on the photograph. Ignore everything",
    "belonging to the app itself: the follow button, the handle, the caption,",
    "the comment and share icons, the page dots.",
    "",
    `Return the text in every one of these languages: ${written}.`,
    "Adapt rather than translate: each version must read as though written by a",
    "native speaker for their own market, in the informal voice of a plant",
    "influencer - a woman - talking to her community:",
    ...voiceRegister(languages),
    "",
    "The largest, most prominent block is the title. Secondary text under it is",
    "the subtitle. If there is only one block, it is the title and the subtitle",
    "is empty. A line like 'link in bio', 'swipe', 'follow for more' is the cta.",
    "If the slide carries no overlay at all, return empty strings everywhere.",
    "",
    "Strip any full stop that ends a line: this text is set on an image.",
    "",
    "placement: where the text sits vertically - top, center or bottom.",
    "visualSummary: what the photograph shows, in English, factual, at most 25",
    "words, naming the species if a plant is identifiable. Never mention the",
    "overlay or the app.",
    "hasPerson: whether a person is visible.",
  ].join("\n");

  const response = await ai().models.generateContent({
    model: config.gemini.textModel,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: image.mimeType,
              data: image.data.toString("base64"),
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          detectedLocale: { type: "string" },
          title: textSchema(languages),
          subtitle: textSchema(languages),
          cta: textSchema(languages),
          placement: { type: "string", enum: ["top", "center", "bottom"] },
          visualSummary: { type: "string" },
          hasPerson: { type: "boolean" },
        },
        required: [
          "detectedLocale",
          "title",
          "subtitle",
          "cta",
          "placement",
          "visualSummary",
          "hasPerson",
        ],
      },
    },
  });

  const raw = response.text;
  if (!raw) throw upstream("Gemini n'a rien renvoyé pour la lecture de la capture. Réessaie.");

  let parsed: ReadSlide;
  try {
    parsed = JSON.parse(raw) as ReadSlide;
  } catch {
    throw upstream("La lecture de la capture est revenue illisible. Réessaie.");
  }

  const strip = (dict: Partial<Record<ContentLocale, string>> | undefined) => {
    const out: Partial<Record<ContentLocale, string>> = {};
    for (const language of languages) {
      out[language] = (dict?.[language] ?? "").trim().replace(/\.$/, "");
    }
    return out;
  };

  return {
    detectedLocale: parsed.detectedLocale ?? "",
    title: strip(parsed.title),
    subtitle: strip(parsed.subtitle),
    cta: strip(parsed.cta),
    placement:
      parsed.placement === "top" || parsed.placement === "bottom"
        ? parsed.placement
        : "center",
    visualSummary: (parsed.visualSummary ?? "").trim(),
    hasPerson: Boolean(parsed.hasPerson),
  };
}

/**
 * Returns the same photograph, without the app's furniture or the old overlay.
 *
 * Every rule here exists because the opposite was tempting to the model. It is
 * a cleanup, not a reinterpretation: the plant, the framing, the light and the
 * room have to survive untouched, or the slide stops being about the thing the
 * post was about.
 */
export async function cleanScreenshot(image: {
  data: Buffer;
  mimeType: string;
}): Promise<{ data: Buffer; mimeType: string }> {
  const prompt = [
    "The attached image is a screenshot of one TikTok carousel slide.",
    "Return the SAME photograph with only these things removed.",
    "",
    "Remove every piece of the app: the follow button, the creator's avatar and",
    "handle, the like, comment, share and bookmark icons, the caption at the",
    "bottom, the page dots, any swipe arrow, and the black bars top and bottom.",
    "",
    "Remove the text overlay that was set on the photograph. Fill what it",
    "covered from what is behind it, extending the photograph seamlessly.",
    "",
    "Recompose to a clean 4:5 portrait with none of the app's margins.",
    "",
    "PRESERVE EXACTLY, this is the whole point:",
    "- the same plant, the same species, the same variegation, the same pot",
    "- the same framing, angle and perspective",
    "- the same light, its direction, its warmth, its softness",
    "- the same colours, the same background, the same room and objects",
    "- the same texture and grain",
    "",
    "This is a cleanup, not a variation and not a remix. Nothing in the",
    "photograph itself may be replaced or reimagined.",
    "",
    "The output carries no text of any kind, no logo, no watermark, no app",
    "interface.",
  ].join("\n");

  const response = await ai().models.generateContent({
    model: config.gemini.imageModel,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: image.mimeType,
              data: image.data.toString("base64"),
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "4:5", imageSize: "2K" },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    const inline = part.inlineData;
    if (inline?.data) {
      return {
        data: Buffer.from(inline.data, "base64"),
        mimeType: inline.mimeType ?? "image/jpeg",
      };
    }
  }
  throw upstream("Gemini n'a renvoyé aucune image nettoyée. Réessaie.");
}

/**
 * One caption and one set of hashtags for the whole rebuilt carousel.
 *
 * Written from what the slides now say rather than copied from the original
 * post: the words on the slides are ours, and the caption has to sound like
 * the same voice wrote both.
 */
export async function writeRepostCaption(
  slides: { title: string; subtitle: string }[],
  languages: ContentLocale[],
): Promise<{
  caption: Partial<Record<ContentLocale, string>>;
  hashtags: Partial<Record<ContentLocale, string[]>>;
}> {
  const written = languages
    .map((l) => `${l} (${LOCALE_WRITING[l].language})`)
    .join(", ");

  const outline = slides
    .map((s, i) => `${i + 1}. ${s.title}${s.subtitle ? ` - ${s.subtitle}` : ""}`)
    .join("\n");

  const prompt = [
    "You write TikTok captions as a houseplant influencer who uses Plenova, a",
    "houseplant care app.",
    "",
    ...creatorVoice(languages),
    "",
    "Here is a photo carousel, slide by slide:",
    outline,
    "",
    `Write a caption and hashtags in each of: ${written}.`,
    "Caption: one to three sentences in her voice, talking to her community, one",
    "or two emoji, no hashtags inside it, ending on a light invitation to save the",
    "post. Adapt per language, never translate.",
    "Hashtags: 6 to 12 per language, lowercase, no # prefix, the tags people",
    "actually use in that language. Always include planttok and plantmom.",
  ].join("\n");

  const response = await ai().models.generateContent({
    model: config.gemini.textModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          caption: textSchema(languages),
          hashtags: {
            type: "object",
            properties: Object.fromEntries(
              languages.map((l) => [
                l,
                { type: "array", items: { type: "string" } },
              ]),
            ),
            required: [...languages],
          },
        },
        required: ["caption", "hashtags"],
      },
    },
  });

  const raw = response.text;
  if (!raw) throw upstream("Gemini n'a renvoyé aucune légende. Réessaie.");
  try {
    return JSON.parse(raw) as {
      caption: Partial<Record<ContentLocale, string>>;
      hashtags: Partial<Record<ContentLocale, string[]>>;
    };
  } catch {
    throw upstream("La légende est revenue illisible. Réessaie.");
  }
}

import "server-only";
import { GoogleGenAI } from "@google/genai";
import { config, isGeminiConfigured } from "@/lib/config";
import { notConfigured, upstream } from "@/lib/errors";
import {
  PIN_COPY_SCHEMA,
  buildCopyPrompt,
  buildImagePrompt,
  buildSystemInstruction,
  type CopyPromptInput,
} from "@/lib/prompts";
import {
  REQUIRED_HASHTAGS,
  buildCarouselPrompt,
  buildCarouselSystemInstruction,
  carouselSchema,
  type CarouselConceptDraft,
  type CarouselPromptInput,
  type CarouselSlideDraft,
  type MultiText,
} from "@/lib/prompts-carousel";
import type { ContentLocale } from "@/lib/i18n";
import { PINTEREST_LIMITS, truncate } from "@/lib/utils";
import type { VisualStyle } from "@/lib/types";

/**
 * Gemini access layer (spec §24). Responsibilities: client init, structured
 * copy generation, image generation, error handling and output normalisation.
 *
 * API surface verified against @google/genai 2.21.0 type definitions:
 *   ai.models.generateContent({ model, contents, config })
 *   config.responseMimeType / config.responseSchema  -> structured JSON
 *   config.responseModalities / config.imageConfig   -> image output
 */

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw notConfigured(
      "GEMINI_API_KEY is not set. Add it to .env.local (or the Vercel project) and reload.",
    );
  }
  client ??= new GoogleGenAI({ apiKey: config.gemini.apiKey! });
  return client;
}

export interface GeneratedCopy {
  title: string;
  description: string;
  keywords: string[];
  altText: string;
  imagePrompt: string;
}

/** Raw model output before normalisation. */
interface RawCopy {
  title?: unknown;
  description?: unknown;
  keywords?: unknown;
  altText?: unknown;
  imagePrompt?: unknown;
}

function asString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw upstream(`Gemini returned no usable "${field}".`);
  }
  return v.trim();
}

/**
 * Normalises model output into something Pinterest will actually accept.
 * Enforcing limits here means a long title can never fail a publish call.
 */
function normaliseCopy(raw: RawCopy): GeneratedCopy {
  const keywords = Array.isArray(raw.keywords)
    ? Array.from(
        new Set(
          raw.keywords
            .filter((k): k is string => typeof k === "string")
            .map((k) => k.toLowerCase().trim())
            .filter((k) => k.length > 1 && k.length < 60),
        ),
      ).slice(0, 12)
    : [];

  if (keywords.length < 3) {
    throw upstream("Gemini returned too few usable keywords.");
  }

  return {
    title: truncate(asString(raw.title, "title"), PINTEREST_LIMITS.titleMax),
    description: truncate(
      asString(raw.description, "description"),
      PINTEREST_LIMITS.descriptionMax,
    ),
    keywords,
    altText: truncate(
      asString(raw.altText, "altText"),
      PINTEREST_LIMITS.altTextMax,
    ),
    imagePrompt: asString(raw.imagePrompt, "imagePrompt"),
  };
}

/** Wraps upstream failures so we never surface a raw SDK error to the client. */
function wrapUpstream(err: unknown, what: string): never {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("api key") || lower.includes("permission") || lower.includes("401")) {
    throw notConfigured(
      `Gemini rejected the API key while ${what}. Check GEMINI_API_KEY.`,
    );
  }
  if (lower.includes("quota") || lower.includes("429") || lower.includes("resource_exhausted")) {
    throw upstream(
      `Gemini quota or rate limit hit while ${what}. Wait a moment and retry.`,
    );
  }
  if (lower.includes("not found") || lower.includes("404")) {
    throw upstream(
      `Gemini model not found while ${what}. Check GEMINI_TEXT_MODEL / GEMINI_IMAGE_MODEL.`,
    );
  }
  if (lower.includes("safety") || lower.includes("blocked")) {
    throw upstream(
      `Gemini blocked the request while ${what}. Try a different angle or custom direction.`,
    );
  }
  throw upstream(`Gemini failed while ${what}.`, { reason: message.slice(0, 300) });
}

/** Generates the structured Pin copy. */
export async function generatePinCopy(
  input: CopyPromptInput,
): Promise<GeneratedCopy> {
  const ai = getClient();
  const prompt = buildCopyPrompt(input);

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.textModel,
      contents: prompt,
      config: {
        systemInstruction: buildSystemInstruction(input.locale),
        responseMimeType: "application/json",
        responseSchema: PIN_COPY_SCHEMA as unknown as Record<string, unknown>,
        // High enough that variations genuinely diverge, low enough to stay factual.
        temperature: 1.0,
      },
    });

    const text = response.text;
    if (!text) throw upstream("Gemini returned an empty copy response.");

    let parsed: RawCopy;
    try {
      parsed = JSON.parse(text) as RawCopy;
    } catch {
      throw upstream("Gemini returned copy that was not valid JSON.");
    }
    return normaliseCopy(parsed);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "generating Pin copy");
  }
}

export interface GeneratedImage {
  /** Raw image bytes. */
  data: Buffer;
  mimeType: string;
}

/** Generates the Pin visual at Pinterest's preferred 2:3 ratio (spec §10). */
export async function generatePinImage(
  imagePrompt: string,
  style: VisualStyle,
): Promise<GeneratedImage> {
  const ai = getClient();
  const prompt = buildImagePrompt(imagePrompt, style);

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.imageModel,
      contents: prompt,
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "2:3",
          // 2K keeps the Pin crisp on high-density displays without bloating
          // the blob. Pinterest recommends at least 1000x1500.
          imageSize: "2K",
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        return {
          data: Buffer.from(inline.data, "base64"),
          mimeType: inline.mimeType ?? "image/png",
        };
      }
    }

    // The model answered, but with no image part - usually a safety refusal.
    const refusal = response.text?.slice(0, 200);
    throw upstream(
      refusal
        ? `Gemini returned no image. Model said: ${refusal}`
        : "Gemini returned no image data.",
    );
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "generating the Pin image");
  }
}


/**
 * Designs a whole carousel from a theme: every slide's overlay copy, every
 * image brief, the caption and the hashtags.
 *
 * This is the step that was missing when carousels were assembled from
 * whatever images happened to already exist - the theme has to drive the
 * images, not the other way round.
 */
export async function generateCarouselConcept(
  input: CarouselPromptInput,
): Promise<CarouselConceptDraft> {
  const ai = getClient();
  const languages = input.languages;

  /** Keeps only the requested languages, trimmed, dropping empties. */
  const pickText = (raw: unknown): MultiText => {
    const out: MultiText = {};
    if (raw && typeof raw === "object") {
      for (const lang of languages) {
        const value = (raw as Record<string, unknown>)[lang];
        if (typeof value === "string" && value.trim()) out[lang] = value.trim();
      }
    }
    return out;
  };

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.textModel,
      contents: buildCarouselPrompt(input),
      config: {
        systemInstruction: buildCarouselSystemInstruction(languages),
        responseMimeType: "application/json",
        responseSchema: carouselSchema(languages) as unknown as Record<
          string,
          unknown
        >,
        temperature: 1.0,
      },
    });

    const text = response.text;
    if (!text) throw upstream("Gemini returned an empty carousel concept.");

    let parsed: {
      slides?: unknown;
      midCtaIndex?: unknown;
      caption?: unknown;
      hashtags?: unknown;
    };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw upstream("Gemini returned a carousel that was not valid JSON.");
    }

    const slides: CarouselSlideDraft[] = (
      Array.isArray(parsed.slides) ? parsed.slides : []
    )
      .map((raw) => {
        const s = raw as Record<string, unknown>;
        return {
          kind: (s.kind === "hook" || s.kind === "cta"
            ? s.kind
            : "content") as CarouselSlideDraft["kind"],
          title: pickText(s.title),
          subtitle: pickText(s.subtitle),
          imagePrompt:
            typeof s.imagePrompt === "string" ? s.imagePrompt.trim() : "",
          photoQuery:
            typeof s.photoQuery === "string" ? s.photoQuery.trim() : "",
          plantTag:
            typeof s.plantTag === "string" ? s.plantTag.trim() : "",
        };
      })
      // A slide with no image brief, or missing the primary language, cannot
      // be rendered - dropping it beats publishing a blank frame.
      .filter(
        (s) => s.imagePrompt.length > 0 && Boolean(s.title[languages[0]!]),
      )
      // TikTok caps a photo carousel at 35 slides.
      .slice(0, 35);

    if (slides.length < 2) {
      throw upstream("Gemini returned too few usable slides for a carousel.");
    }

    const hashtags: Partial<Record<ContentLocale, string[]>> = {};
    const rawTags = (parsed.hashtags ?? {}) as Record<string, unknown>;
    for (const lang of languages) {
      const list = Array.isArray(rawTags[lang]) ? (rawTags[lang] as unknown[]) : [];
      hashtags[lang] = Array.from(
        new Set([
          ...list
            .filter((h): h is string => typeof h === "string")
            .map((h) => h.replace(/^#/, "").toLowerCase().trim())
            .filter((h) => h.length > 1 && h.length < 40),
          // Enforced rather than hoped for, as in the original engine.
          ...REQUIRED_HASHTAGS,
        ]),
      ).slice(0, 12);
    }

    // Clamp to a content slide: the model occasionally points at the hook or
    // the call to action, which already carry their own message.
    const rawMid = Number((parsed as { midCtaIndex?: unknown }).midCtaIndex);
    const midCtaIndex =
      Number.isInteger(rawMid) && rawMid >= 2 && rawMid <= slides.length - 1
        ? rawMid
        : Math.max(2, Math.min(slides.length - 1, Math.ceil(slides.length / 2)));

    return {
      slides,
      midCtaIndex,
      caption: pickText(parsed.caption),
      hashtags,
    };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "designing the carousel");
  }
}


/**
 * Produces an original image using a real photograph as reference.
 *
 * Text-to-image alone yields pristine, evenly-lit frames, and that polish is
 * exactly what reads as AI. Anchoring on a real photograph carries over the
 * things a prompt never asks for - a cable on the floor, a chipped pot, a leaf
 * with a brown edge - while the output stays an original image rather than a
 * copy, so nothing from the reference is republished.
 */
export async function reinterpretImage(
  reference: { data: Buffer; mimeType: string },
  brief: string,
  aspectRatio: string,
): Promise<GeneratedImage> {
  const ai = getClient();

  const instruction = [
    "Use the supplied photograph as a visual reference for lighting, texture and realism.",
    "",
    "Produce a NEW, original photograph of this scene:",
    brief,
    "",
    "It must read as a real photograph taken by a person, not a render:",
    "- keep believable domestic imperfection - worn surfaces, a stray cable, an imperfect leaf",
    "- natural uneven lighting rather than an evenly lit studio",
    "- authentic depth of field and minor sensor grain",
    "Change the room details, the pot and the framing distance so the result is",
    "its own photograph rather than a copy of the reference.",
    "No text, no watermark, no logo, no brand mark.",
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.imageModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: reference.mimeType,
                data: reference.data.toString("base64"),
              },
            },
            { text: instruction },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio, imageSize: "2K" },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        return {
          data: Buffer.from(inline.data, "base64"),
          mimeType: inline.mimeType ?? "image/jpeg",
        };
      }
    }
    throw upstream("Gemini returned no image when reinterpreting the reference.");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "reinterpreting the reference photograph");
  }
}

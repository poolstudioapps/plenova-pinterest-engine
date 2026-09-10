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
  CAROUSEL_SCHEMA,
  REQUIRED_HASHTAGS,
  buildCarouselPrompt,
  buildCarouselSystemInstruction,
  type CarouselConceptDraft,
  type CarouselPromptInput,
  type CarouselSlideDraft,
} from "@/lib/prompts-carousel";
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

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.textModel,
      contents: buildCarouselPrompt(input),
      config: {
        systemInstruction: buildCarouselSystemInstruction(input.locale),
        responseMimeType: "application/json",
        responseSchema: CAROUSEL_SCHEMA as unknown as Record<string, unknown>,
        temperature: 1.0,
      },
    });

    const text = response.text;
    if (!text) throw upstream("Gemini returned an empty carousel concept.");

    let parsed: { slides?: unknown; caption?: unknown; hashtags?: unknown };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw upstream("Gemini returned a carousel that was not valid JSON.");
    }

    const slides = Array.isArray(parsed.slides)
      ? (parsed.slides as CarouselSlideDraft[])
          .filter(
            (s) =>
              s &&
              typeof s.title === "string" &&
              typeof s.imagePrompt === "string" &&
              s.imagePrompt.trim().length > 0,
          )
          // TikTok caps a photo carousel at 35 slides.
          .slice(0, 35)
          .map((s) => ({
            kind: (s.kind === "hook" || s.kind === "cta"
              ? s.kind
              : "content") as CarouselSlideDraft["kind"],
            title: s.title.trim(),
            subtitle: typeof s.subtitle === "string" ? s.subtitle.trim() : "",
            imagePrompt: s.imagePrompt.trim(),
          }))
      : [];

    if (slides.length < 2) {
      throw upstream("Gemini returned too few usable slides for a carousel.");
    }

    const hashtags = Array.from(
      new Set([
        ...(Array.isArray(parsed.hashtags) ? parsed.hashtags : [])
          .filter((h): h is string => typeof h === "string")
          .map((h) => h.replace(/^#/, "").toLowerCase().trim())
          .filter((h) => h.length > 1 && h.length < 40),
        // Enforced rather than hoped for, as in the original engine.
        ...REQUIRED_HASHTAGS,
      ]),
    ).slice(0, 12);

    return {
      slides,
      caption:
        typeof parsed.caption === "string" ? parsed.caption.trim() : "",
      hashtags,
    };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "designing the carousel");
  }
}

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
import { HOOK_FORMATS, type HookFormat, type VisualStyle } from "@/lib/types";
import { creatorVoice, voiceRegister } from "@/lib/voice";

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
      "Il manque la clé GEMINI_API_KEY. Ajoute-la dans .env.local (ou dans le projet Vercel), puis recharge la page.",
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
    throw upstream(`Gemini n'a pas renvoyé de "${field}" exploitable.`);
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
    throw upstream("Gemini a renvoyé trop peu de mots-clés exploitables.");
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

/**
 * Trouble that is Gemini's and passes: overload, a 5xx, a dropped connection.
 *
 * A carousel concept failed on exactly this - "Gemini a échoué pendant la
 * conception du carrousel", with nothing to act on - while the same call
 * worked a minute later. Worth trying again before giving up.
 */
function isTransient(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /(500|502|503|504)|overloaded|unavailable|internal error|deadline|timed? ?out|econnreset|fetch failed|socket hang up/.test(
    m,
  );
}

/** Up to three tries, a few seconds apart, for transient failures only. */
async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= attempts || !isTransient(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** (attempt - 1)));
    }
  }
}

/** Wraps upstream failures so we never surface a raw SDK error to the client. */
function wrapUpstream(err: unknown, what: string): never {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("api key") || lower.includes("permission") || lower.includes("401")) {
    throw notConfigured(
      `Gemini a refusé la clé API pendant ${what}. Vérifie GEMINI_API_KEY.`,
    );
  }
  if (lower.includes("quota") || lower.includes("429") || lower.includes("resource_exhausted")) {
    throw upstream(
      `Quota ou limite de débit Gemini atteint pendant ${what}. Attends un instant et réessaie.`,
    );
  }
  if (lower.includes("not found") || lower.includes("404")) {
    throw upstream(
      `Modèle Gemini introuvable pendant ${what}. Vérifie GEMINI_TEXT_MODEL / GEMINI_IMAGE_MODEL.`,
    );
  }
  if (lower.includes("safety") || lower.includes("blocked")) {
    throw upstream(
      `Gemini a bloqué la demande pendant ${what}. Essaie un autre angle ou une autre direction personnalisée.`,
    );
  }
  if (isTransient(err)) {
    throw upstream(
      `Gemini est momentanément surchargé pendant ${what}. Réessaie dans une minute.`,
      { reason: message.slice(0, 300) },
    );
  }
  throw upstream(`Gemini a échoué pendant ${what}.`, { reason: message.slice(0, 300) });
}

/** Generates the structured Pin copy. */
export async function generatePinCopy(
  input: CopyPromptInput,
): Promise<GeneratedCopy> {
  const ai = getClient();
  const prompt = buildCopyPrompt(input);

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: config.gemini.textModel,
      contents: prompt,
      config: {
        systemInstruction: buildSystemInstruction(input.locale),
        responseMimeType: "application/json",
        responseSchema: PIN_COPY_SCHEMA as unknown as Record<string, unknown>,
        // High enough that variations genuinely diverge, low enough to stay factual.
        temperature: 1.0,
      },
    }));

    const text = response.text;
    if (!text) throw upstream("Gemini a renvoyé une réponse vide pour le texte.");

    let parsed: RawCopy;
    try {
      parsed = JSON.parse(text) as RawCopy;
    } catch {
      throw upstream("Gemini a renvoyé un texte qui n'est pas du JSON valide.");
    }
    return normaliseCopy(parsed);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "la génération du texte du Pin");
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
    const response = await withRetry(() => ai.models.generateContent({
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
    }));

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
        ? `Gemini n'a pas renvoyé d'image. Réponse du modèle : ${refusal}`
        : "Gemini n'a renvoyé aucune image.",
    );
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "la génération de l'image du Pin");
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
    const response = await withRetry(() => ai.models.generateContent({
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
    }));

    const text = response.text;
    if (!text) throw upstream("Gemini a renvoyé un concept de carrousel vide.");

    let parsed: {
      slides?: unknown;
      midCtaIndex?: unknown;
      caption?: unknown;
      hashtags?: unknown;
    };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw upstream("Gemini a renvoyé un carrousel qui n'est pas du JSON valide.");
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
          cta: pickText(s.cta),
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
      throw upstream("Gemini a renvoyé trop peu de slides exploitables pour un carrousel.");
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
    wrapUpstream(err, "la conception du carrousel");
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
/** The species a slide must show, from the catalog - not from the model. */
export interface SpeciesAnchor {
  scientificName: string;
  commonName: string;
  /** The catalog's visual description, the single biggest accuracy lever. */
  visualTraits?: string;
}

export async function reinterpretImage(
  reference: { data: Buffer; mimeType: string },
  brief: string,
  aspectRatio: string,
  species?: SpeciesAnchor | null,
): Promise<GeneratedImage> {
  const ai = getClient();

  /*
   * The species is stated before anything else, and the reference is demoted
   * below it on purpose.
   *
   * Pexels answers a search, not a botanical question: a query for a pothos
   * can come back with a philodendron, and a model handed that photo plus a
   * one-line brief will happily render the philodendron. The reference is for
   * how the photograph FEELS - light, grain, realism - and never for what plant
   * is in it.
   */
  const speciesLines = species
    ? [
        `THE PLANT MUST BE: ${species.scientificName} (${species.commonName}).`,
        ...(species.visualTraits
          ? [`It looks like this: ${species.visualTraits}.`]
          : []),
        "If the reference shows a different plant, do NOT copy it - render this species instead.",
        "",
      ]
    : [];

  const instruction = [
    ...speciesLines,
    "Use the supplied photograph ONLY as a reference for lighting, texture and realism.",
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
    const response = await withRetry(() => ai.models.generateContent({
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
    }));

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
    throw upstream("Gemini n'a renvoyé aucune image en réinterprétant la photo de référence.");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "la réinterprétation de la photo de référence");
  }
}

const LANGUAGE_NAMES: Record<ContentLocale, string> = {
  fr: "French",
  en: "English",
  es: "Spanish",
  de: "German",
  it: "Italian",
};

/**
 * One slide's words, carried into other languages.
 *
 * For saved slides - the CTA above all - written once and needed in every
 * language a carousel may be published in. The words are adapted the way a
 * native TikTok creator would put them rather than translated word for word,
 * stay as short as the original, keep their line breaks, and never translate
 * the brand. An empty field stays empty.
 */
export async function translateSlideCopy(input: {
  from: ContentLocale;
  text: { title: string; subtitle: string; cta: string };
  to: ContentLocale[];
}): Promise<Partial<Record<ContentLocale, { title: string; subtitle: string; cta: string }>>> {
  const ai = getClient();
  const targets = input.to.filter((l) => l !== input.from);
  if (targets.length === 0) return {};

  const field = { type: "string" };
  const schema = {
    type: "object",
    properties: Object.fromEntries(
      targets.map((l) => [
        l,
        {
          type: "object",
          properties: { title: field, subtitle: field, cta: field },
          required: ["title", "subtitle", "cta"],
        },
      ]),
    ),
    required: targets,
  };

  const prompt = [
    `Adapt the words of one TikTok carousel slide from ${LANGUAGE_NAMES[input.from]} into ${targets
      .map((l) => `${LANGUAGE_NAMES[l]} (key "${l}")`)
      .join(", ")}.`,
    "Write each one the way a native TikTok creator in that language would say it: natural, spoken, as short as the original - never longer.",
    "The voice is a plant influencer, a woman, talking to her community - keep that friendly, informal register:",
    ...voiceRegister(targets),
    'Keep the brand name "Plenova" exactly as it is. Keep line breaks where the original has them. Keep emoji. A field that is empty in the original stays empty.',
    "",
    JSON.stringify(input.text),
  ].join("\n");

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: config.gemini.textModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema as unknown as Record<string, unknown>,
        temperature: 0.4,
      },
    }));
    const raw = response.text;
    if (!raw) throw upstream("Gemini a renvoyé une traduction vide.");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw upstream("Gemini a renvoyé une traduction qui n'est pas du JSON valide.");
    }
    const out: Partial<Record<ContentLocale, { title: string; subtitle: string; cta: string }>> = {};
    for (const l of targets) {
      const t = (parsed[l] ?? {}) as Record<string, unknown>;
      const pick = (key: "title" | "subtitle" | "cta") =>
        // An empty original stays empty, whatever came back.
        input.text[key].trim() && typeof t[key] === "string" ? (t[key] as string).trim() : "";
      out[l] = { title: pick("title"), subtitle: pick("subtitle"), cta: pick("cta") };
    }
    return out;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "la traduction de la slide");
  }
}

/**
 * Fresh hooks - cover lines for carousels - that are none of the ones already
 * in the bank.
 *
 * The whole bank goes into the prompt as a list to stay away from, ours and
 * the ones seen on spied accounts alike: a suggestion is only worth something
 * if it has not been posted already. The caller still filters what comes back,
 * because a list in a prompt is a request, not a guarantee.
 */
export async function generateHookIdeas(input: {
  count: number;
  exclude: string[];
  plantName?: string;
  direction?: string;
}): Promise<string[]> {
  const ai = getClient();
  const prompt = [
    `Write ${input.count} new hooks, in French, for TikTok photo carousels about houseplants.`,
    "A hook is the cover line: the one sentence on the first slide that makes someone stop scrolling and swipe.",
    "",
    input.plantName ? `Every hook is about this plant: ${input.plantName}.` : "",
    input.direction ? `Direction from the operator (highest priority): ${input.direction}` : "",
    "",
    "Vary the formats across the list, never the same shape twice in a row:",
    "- a numbered list ('Les 5 plantes qui...', '7 erreurs que...'): the number sets how many slides follow, so keep it between 3 and 8",
    "- a mistake or a myth, a care trick, a before/after, a confession ('J'ai arrêté de...'), a POV, a comparison, a question",
    "",
    "Rules:",
    "- 4 to 12 words, spoken French, in her voice. No emoji, no hashtags, no final full stop.",
    "- Each one must work as a carousel of plant photographs with short text on them.",
    "- Honest: no invented numbers, no fake urgency, no promise the carousel cannot keep.",
    "",
    input.exclude.length > 0
      ? "## Already used or already seen - never propose any of these, nor the same idea reworded:"
      : "",
    ...input.exclude.map((h) => `- ${h}`),
  ]
    .filter((l) => l !== "")
    .join("\n");

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: config.gemini.textModel,
        contents: prompt,
        config: {
          systemInstruction: [
            "You write for a houseplant influencer on TikTok, a woman talking to her own community.",
            ...creatorVoice(["fr"]),
          ].join("\n"),
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: { hooks: { type: "array", items: { type: "string" } } },
            required: ["hooks"],
          } as unknown as Record<string, unknown>,
          temperature: 1.0,
        },
      }),
    );
    const raw = response.text;
    if (!raw) throw upstream("Gemini n'a proposé aucun hook.");
    let parsed: { hooks?: unknown };
    try {
      parsed = JSON.parse(raw) as { hooks?: unknown };
    } catch {
      throw upstream("Les hooks proposés sont revenus illisibles.");
    }
    return Array.isArray(parsed.hooks)
      ? parsed.hooks
          .filter((h): h is string => typeof h === "string")
          .map((h) => h.trim().replace(/[.。]+$/, ""))
          .filter(Boolean)
      : [];
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "la proposition de hooks");
  }
}

export interface SpiedHookRead {
  /** The cover line exactly as written, in its own language; "" when there is none. */
  hook: string;
  /** ISO 639-1 code of that line. */
  lang: string;
  format: HookFormat;
  /** The same hook in natural French, in our voice; "" when there is no hook. */
  hookFr: string;
}

/**
 * Reads the hook off the cover of a spied carousel, and brings it home.
 *
 * The original is kept word for word - it is the evidence of what worked - and
 * a French version in our voice goes into the hook bank as an idea: same
 * promise, same shape, same number, since the number sets how many slides a
 * carousel built from it will have.
 */
export async function readSpiedHook(
  cover: { data: Buffer; mimeType: string },
  caption: string,
): Promise<SpiedHookRead> {
  const ai = getClient();
  const prompt = [
    "This is the FIRST slide - the cover - of a TikTok photo carousel about plants, posted by another creator.",
    caption ? `Its caption, for context only: ${caption.slice(0, 500)}` : "",
    "",
    "hook: the text written on this cover, exactly as written, in its own language. Join its lines with spaces. Ignore the app's interface and any watermark. Empty string if the cover carries no text.",
    "lang: the ISO 639-1 code of that text (fr, en, es, pt, it, de, nl, cs...). Empty if there is no text.",
    `format: the shape of the hook, one of ${HOOK_FORMATS.join(", ")}.`,
    "  list = a numbered or counted selection ('5 plants that...'); mistakes = errors or myths; tip = a care trick or how-to; transformation = before/after or a rescue; pov = a POV or a situation; question = a question to the viewer; story = a confession or personal story; other = anything else.",
    "hookFr: the same hook rewritten in natural, spoken French, in her voice - not a word-for-word translation. Keep the promise, the format and any number exactly. 4 to 14 words, no emoji, no final full stop. If it names another app, brand, shop or creator, put Plenova in its place where the sentence still works, otherwise drop that part. Empty string if hook is empty.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: config.gemini.textModel,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: cover.mimeType, data: cover.data.toString("base64") } },
              { text: prompt },
            ],
          },
        ],
        config: {
          systemInstruction: [
            "You read TikTok carousels for a houseplant influencer, a woman talking to her own community, and bring the good ideas home in her voice.",
            ...creatorVoice(["fr"]),
          ].join("\n"),
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              hook: { type: "string" },
              lang: { type: "string" },
              format: { type: "string", enum: [...HOOK_FORMATS] },
              hookFr: { type: "string" },
            },
            required: ["hook", "lang", "format", "hookFr"],
          } as unknown as Record<string, unknown>,
          temperature: 0.4,
        },
      }),
    );
    const raw = response.text;
    if (!raw) throw upstream("Gemini n'a rien lu sur la couverture.");
    let parsed: Partial<SpiedHookRead>;
    try {
      parsed = JSON.parse(raw) as Partial<SpiedHookRead>;
    } catch {
      throw upstream("La lecture du hook est revenue illisible.");
    }
    const clean = (v: unknown) =>
      typeof v === "string" ? v.replace(/\s+/g, " ").trim().replace(/[.。]+$/, "") : "";
    const hook = clean(parsed.hook);
    return {
      hook,
      lang: hook ? clean(parsed.lang).toLowerCase().slice(0, 5) : "",
      format: HOOK_FORMATS.includes(parsed.format as HookFormat) ? (parsed.format as HookFormat) : "other",
      hookFr: hook ? clean(parsed.hookFr) : "",
    };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    wrapUpstream(err, "la lecture d'un hook");
  }
}

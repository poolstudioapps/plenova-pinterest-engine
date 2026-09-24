import { CONTENT_LOCALES, isContentLocale, type ContentLocale } from "@/lib/i18n";
import type { SlideText } from "@/lib/types";

/**
 * The words of a slide, as the server keeps them.
 *
 * One place for the limits and the cleaning, used by the editor's save, the
 * saved slides and the editor itself - so a field stops where the server
 * would have cut it, instead of being trimmed without a word.
 */
export const SLIDE_TEXT_LIMITS = { title: 400, subtitle: 600, cta: 400 } as const;

/** TikTok takes up to 35 pictures in one photo post. */
export const MAX_CAROUSEL_SLIDES = 35;

export function cleanSlideText(raw: unknown): SlideText {
  const t = (raw ?? {}) as Record<string, unknown>;
  const field = (value: unknown, max: number) => (typeof value === "string" ? value : "").slice(0, max);
  return {
    title: field(t.title, SLIDE_TEXT_LIMITS.title),
    subtitle: field(t.subtitle, SLIDE_TEXT_LIMITS.subtitle),
    cta: field(t.cta, SLIDE_TEXT_LIMITS.cta),
  };
}

/** Every known language present in `raw`, cleaned; anything else is dropped. */
export function cleanSlideTexts(
  raw: unknown,
  languages: readonly ContentLocale[] = CONTENT_LOCALES,
): Partial<Record<ContentLocale, SlideText>> {
  const out: Partial<Record<ContentLocale, SlideText>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [language, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isContentLocale(language) || !languages.includes(language)) continue;
    out[language] = cleanSlideText(value);
  }
  return out;
}

/** True when a language has words on the slide at all. */
export function hasWords(text: SlideText | undefined): boolean {
  return Boolean(text && (text.title.trim() || text.subtitle.trim() || (text.cta ?? "").trim()));
}

"use client";

import { Field, Picker } from "@/components/ui";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
  type TranslationKey,
} from "@/lib/i18n";
import { OVERLAY_STYLES, type OverlayStyle } from "@/lib/overlay";
import { cn } from "@/lib/utils";

const OVERLAY_STYLE_LABELS: Record<OverlayStyle, TranslationKey> = {
  stroke: "editor.styleStroke",
  pillWhite: "editor.stylePillWhite",
  pillBlack: "editor.stylePillBlack",
  none: "editor.styleNone",
};

/**
 * The choices that apply however the slides were obtained.
 *
 * Language and text style belong to both ways in: a repost is written in the
 * same languages and wears the same overlay as a carousel written from
 * scratch. They used to live only in the "new" panel, which left the Reposter
 * tab with a dead button whose cause was on a screen you could not see.
 */
export function WritingOptions({
  languages,
  onToggleLanguage,
  overlayStyle,
  onOverlayStyle,
}: {
  languages: ContentLocale[];
  onToggleLanguage: (lang: ContentLocale) => void;
  overlayStyle: OverlayStyle;
  onOverlayStyle: (style: OverlayStyle) => void;
}) {
  const t = translator();
  return (
    <div className="grid gap-5 border-t border-[var(--color-line)] pt-5 md:grid-cols-2">
      <div>
        <p className="mb-1.5 text-[13px] font-medium">{t("carousels.languages")}</p>
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_LOCALES.map((lang) => {
            const on = languages.includes(lang);
            return (
              <button
                key={lang}
                type="button"
                onClick={() => onToggleLanguage(lang)}
                aria-pressed={on}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  on
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
                    : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]",
                )}
              >
                {CONTENT_LOCALE_LABELS[lang]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
          {t("carousels.languagesHint")}
        </p>
      </div>

      <Field
        label={t("carousels.overlayStyle")}
        htmlFor="ov"
        hint={t("carousels.overlayHint")}
      >
        <Picker
          id="ov"
          options={OVERLAY_STYLES.map((style) => ({
            value: style,
            label: t(OVERLAY_STYLE_LABELS[style]),
          }))}
          value={overlayStyle}
          onChange={(v) => onOverlayStyle(v as OverlayStyle)}
        />
      </Field>
    </div>
  );
}

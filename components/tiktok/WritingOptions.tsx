"use client";

import { Field, MultiPicker, Picker } from "@/components/ui";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
  type TranslationKey,
} from "@/lib/i18n";
import { OVERLAY_STYLES, type OverlayStyle } from "@/lib/overlay";

const OVERLAY_STYLE_LABELS: Record<OverlayStyle, TranslationKey> = {
  stroke: "editor.styleStroke",
  pillWhite: "editor.stylePillWhite",
  pillBlack: "editor.stylePillBlack",
  none: "editor.styleNone",
};

const LANGUAGE_OPTIONS = CONTENT_LOCALES.map((l) => ({
  value: l,
  label: CONTENT_LOCALE_LABELS[l],
}));

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
    <div className="grid gap-5 md:grid-cols-2">
      {/*
        The same controls as the new-carousel panel, not a second design of
        them: a row of chips here beside dropdowns there made the two tabs look
        like two different products.
      */}
      <Field label={t("carousels.languages")} htmlFor="repost-langs">
        <MultiPicker
          id="repost-langs"
          options={LANGUAGE_OPTIONS}
          values={languages}
          onToggle={(v) => onToggleLanguage(v as ContentLocale)}
          placeholder={t("carousels.blockedLanguages")}
          summary={(n) => t("carousels.languageCount", { n })}
        />
      </Field>

      <Field label={t("carousels.overlayStyle")} htmlFor="repost-ov">
        <Picker
          id="repost-ov"
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

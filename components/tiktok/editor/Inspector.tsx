"use client";

import { useEffect, useState } from "react";
import { Button, Notice, Picker } from "@/components/ui";
import {
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
  type TranslationKey,
} from "@/lib/i18n";
import {
  OVERLAY_STYLES,
  PHOTO_DEFAULTS,
  PHOTO_MAX_ZOOM,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  TEXT_COLORS,
  photoLayout,
  type OverlayBlock,
  type OverlayStyle,
  type PhotoFrame,
} from "@/lib/overlay";
import { isPillStyle } from "@/lib/pill";
import { cn } from "@/lib/utils";
import * as Icon from "./icons";
import { BLOCKS, TEXT_LIMITS, type BlockKey, type SlideWords } from "./state";

export const STYLE_LABELS: Record<OverlayStyle, TranslationKey> = {
  stroke: "editor.styleStroke",
  pillWhite: "editor.stylePillWhite",
  pillBlack: "editor.stylePillBlack",
  none: "editor.styleNone",
};

export const BLOCK_LABELS: Record<BlockKey, TranslationKey> = {
  title: "editor.blockTitle",
  subtitle: "editor.blockSubtitle",
  cta: "editor.blockCta",
};

const WEIGHTS: { value: number; label: TranslationKey }[] = [
  { value: 400, label: "editor.weight400" },
  { value: 500, label: "editor.weight500" },
  { value: 600, label: "editor.weight600" },
  { value: 700, label: "editor.weight700" },
  { value: 800, label: "editor.weight800" },
  { value: 900, label: "editor.weight900" },
];

// ------------------------------------------------------------ primitives

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-[var(--color-line)] px-4 py-4 last:border-b-0">
      <h3 className="text-[11px] font-semibold tracking-[0.07em] text-[var(--color-ink-faint)] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px] font-medium text-[var(--color-ink-soft)]">
        <span>{label}</span>
        {value !== undefined ? (
          <span className="text-[var(--color-ink-faint)] tabular-nums">{value}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; content: React.ReactNode; title?: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-[11px] bg-[var(--color-surface-muted)] p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          aria-label={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-[8px] px-2 py-1.5 text-[12.5px] font-medium transition-colors",
            value === o.value
              ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
              : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
          )}
        >
          {o.content}
        </button>
      ))}
    </div>
  );
}

export function ToolButton({
  icon,
  children,
  onClick,
  disabled,
  pressed,
  wide,
  title,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  wide?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        wide && "w-full justify-start",
        pressed
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
          : "border-[var(--color-line-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-accent)]",
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

/**
 * A number that can be typed through invalid states - "5" on the way to
 * "540" - without being clamped at every keystroke. Valid values apply as
 * they are typed; leaving the field settles anything else.
 */
function NumberInput({
  label,
  title,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  title: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const settle = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(n)));
    if (clamped !== value) onChange(clamped);
    setText(String(clamped));
  };

  return (
    <label
      title={title}
      className="flex items-center gap-1 rounded-[9px] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 py-1 focus-within:border-[var(--color-accent)]"
    >
      <span className="text-[11px] font-semibold text-[var(--color-ink-faint)]">{label}</span>
      <input
        inputMode="numeric"
        value={text}
        aria-label={title}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          settle();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) {
            onChange(Math.round(n));
          }
        }}
        className="w-full min-w-0 bg-transparent text-[12.5px] tabular-nums outline-none"
      />
    </label>
  );
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  const t = translator();
  const custom = value && !TEXT_COLORS.some((c) => c.value === value) ? value : null;
  const swatch =
    "size-[26px] shrink-0 cursor-pointer rounded-full border border-black/15 transition-[box-shadow,transform] hover:scale-110";
  const on = "shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-accent)]";
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-label={t("editor.colorAuto")}
        aria-pressed={value === null}
        title={t("editor.colorAuto")}
        onClick={() => onChange(null)}
        className={cn(swatch, value === null && on)}
        style={{
          background:
            "linear-gradient(135deg, #fff 0 46%, #ea4040 46% 54%, #fff 54% 100%)",
        }}
      />
      {TEXT_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-label={c.label}
          aria-pressed={value === c.value}
          title={c.label}
          onClick={() => onChange(c.value)}
          className={cn(swatch, value === c.value && on)}
          style={{ background: c.value }}
        />
      ))}
      <label
        title={t("editor.colorCustom")}
        className={cn(swatch, "relative", custom && on)}
        style={{
          background:
            custom ?? "conic-gradient(#ea4040, #f2cd46, #78c25e, #3496f0, #5856d5, #f5a3c7, #ea4040)",
        }}
      >
        <input
          type="color"
          value={custom ?? "#ffffff"}
          aria-label={t("editor.colorCustom")}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

// -------------------------------------------------------------- sections

export function TextSection({
  words,
  lang,
  elsewhere,
  selected,
  isMention,
  onSelect,
  onText,
}: {
  words: SlideWords;
  lang: ContentLocale;
  /** Per block, the other languages it is written in while empty in this one. */
  elsewhere: Record<BlockKey, ContentLocale[]>;
  selected: BlockKey | null;
  isMention: boolean;
  onSelect: (key: BlockKey) => void;
  onText: (key: BlockKey, value: string) => void;
}) {
  const t = translator();
  return (
    <Section title={t("editor.textSection", { lang: CONTENT_LOCALE_LABELS[lang] })}>
      {BLOCKS.map((key) => {
        const value = words[key];
        const limit = TEXT_LIMITS[key];
        return (
          <div key={key}>
            <label className="mb-1 flex items-center justify-between text-[12px] font-medium">
              <span
                className={cn(
                  selected === key ? "text-[var(--color-accent)]" : "text-[var(--color-ink-soft)]",
                )}
              >
                {t(BLOCK_LABELS[key])}
              </span>
              {value.length > limit * 0.8 ? (
                <span className="text-[11px] text-[var(--color-warn-ink)] tabular-nums">
                  {value.length}/{limit}
                </span>
              ) : null}
            </label>
            <textarea
              value={value}
              maxLength={limit}
              rows={key === "cta" ? 1 : 2}
              aria-label={t(BLOCK_LABELS[key])}
              data-text-field={key}
              onFocus={() => onSelect(key)}
              onChange={(e) => onText(key, e.target.value)}
              className={cn(
                "block w-full resize-y rounded-[10px] border bg-[var(--color-surface)] px-3 py-2 text-[13.5px] leading-snug outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-soft)]",
                selected === key
                  ? "border-[var(--color-accent)]"
                  : "border-[var(--color-line-strong)]",
              )}
            />
            {elsewhere[key].length > 0 ? (
              <p className="mt-1 text-[11.5px] text-[var(--color-warn-ink)]">
                {t("editor.untranslated", {
                  langs: elsewhere[key].map((l) => CONTENT_LOCALE_LABELS[l]).join(", "),
                  lang: CONTENT_LOCALE_LABELS[lang],
                })}
              </p>
            ) : null}
            {key === "cta" ? (
              <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
                {isMention ? t("editor.ctaHintHere") : t("editor.ctaHint")}
              </p>
            ) : null}
          </div>
        );
      })}
    </Section>
  );
}

export function BlockSection({
  selected,
  block,
  slideStyle,
  onSelect,
  onBlock,
  onCenter,
  onResetBlock,
  onDeleteBlock,
  canDelete,
}: {
  selected: BlockKey | null;
  block: OverlayBlock | null;
  slideStyle: OverlayStyle;
  onSelect: (key: BlockKey) => void;
  onBlock: (patch: Partial<OverlayBlock>, field: string) => void;
  onCenter: (axis: "x" | "y") => void;
  onResetBlock: () => void;
  /** Takes the selected block's words off the slide, in every language. */
  onDeleteBlock: () => void;
  canDelete: boolean;
}) {
  const t = translator();
  const effective = block ? (block.style ?? slideStyle) : slideStyle;
  const pill = isPillStyle(effective);

  return (
    <Section title={t("editor.blockSection")}>
      <Segmented
        label={t("editor.blockSection")}
        options={BLOCKS.map((key) => ({ value: key, content: t(BLOCK_LABELS[key]) }))}
        value={selected}
        onChange={onSelect}
      />

      {!block ? (
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
          {t("editor.noBlock")}
        </p>
      ) : (
        <div className="space-y-3.5">
          <Row label={t("editor.blockStyle")}>
            <Picker
              options={[
                // The one row whose meaning depends on something else, so it
                // carries what it resolves to right now.
                {
                  value: "",
                  label: t("editor.styleInherit"),
                  detail: t(STYLE_LABELS[slideStyle]),
                },
                ...OVERLAY_STYLES.map((style) => ({
                  value: style,
                  label: t(STYLE_LABELS[style]),
                })),
              ]}
              value={block.style ?? ""}
              onChange={(v) => onBlock({ style: v ? (v as OverlayStyle) : null }, "style")}
            />
          </Row>

          <Row label={pill ? t("editor.colorPill") : t("editor.colorText")}>
            <ColorSwatches
              value={block.color ?? null}
              onChange={(color) => onBlock({ color }, "color")}
            />
            <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
              {pill ? t("editor.colorPillHint") : t("editor.colorTextHint")}
            </p>
          </Row>

          <Row label={t("editor.size")} value={`${block.fontSize} px`}>
            <input
              type="range"
              min={16}
              max={240}
              value={block.fontSize}
              aria-label={t("editor.size")}
              onChange={(e) => onBlock({ fontSize: Number(e.target.value) }, "fontSize")}
              className="w-full accent-[var(--color-accent)]"
            />
          </Row>

          <div className="grid grid-cols-2 gap-3">
            <Row label={t("editor.weight")}>
              <Picker
                options={WEIGHTS.map((w) => ({ value: String(w.value), label: t(w.label) }))}
                value={String(block.fontWeight)}
                onChange={(v) => onBlock({ fontWeight: Number(v) }, "fontWeight")}
              />
            </Row>
            <Row label={t("editor.lineHeight")} value={block.lineHeight.toFixed(2)}>
              <input
                type="range"
                min={0.9}
                max={2.5}
                step={0.05}
                value={block.lineHeight}
                aria-label={t("editor.lineHeight")}
                onChange={(e) => onBlock({ lineHeight: Number(e.target.value) }, "lineHeight")}
                className="mt-2.5 w-full accent-[var(--color-accent)]"
              />
            </Row>
          </div>

          <Row label={t("editor.align")}>
            <Segmented
              label={t("editor.align")}
              options={[
                { value: "left" as const, content: <Icon.AlignLeft />, title: t("editor.alignLeft") },
                { value: "center" as const, content: <Icon.AlignCenter />, title: t("editor.alignCenter") },
                { value: "right" as const, content: <Icon.AlignRight />, title: t("editor.alignRight") },
              ]}
              value={block.align}
              onChange={(align) => onBlock({ align }, "align")}
            />
          </Row>

          {effective === "stroke" ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
              <Row label={t("editor.strokeColor")}>
                <input
                  type="color"
                  value={block.strokeColor}
                  aria-label={t("editor.strokeColor")}
                  onChange={(e) => onBlock({ strokeColor: e.target.value }, "strokeColor")}
                  className="h-9 w-14 cursor-pointer rounded-[9px] border border-[var(--color-line-strong)] bg-transparent"
                />
              </Row>
              <Row label={t("editor.strokeWidth")} value={`${block.strokeWidth} %`}>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={block.strokeWidth}
                  aria-label={t("editor.strokeWidth")}
                  onChange={(e) => onBlock({ strokeWidth: Number(e.target.value) }, "strokeWidth")}
                  className="mt-2.5 w-full accent-[var(--color-accent)]"
                />
              </Row>
            </div>
          ) : null}

          <Row label={t("editor.geometry")}>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              <NumberInput
                label="X"
                title={t("editor.posX")}
                value={block.x}
                min={0}
                max={SLIDE_WIDTH}
                onChange={(x) => onBlock({ x }, "num:x")}
              />
              <NumberInput
                label="Y"
                title={t("editor.posY")}
                value={block.y}
                min={0}
                max={SLIDE_HEIGHT}
                onChange={(y) => onBlock({ y }, "num:y")}
              />
              <NumberInput
                label="L"
                title={t("editor.width")}
                value={block.width}
                min={80}
                max={SLIDE_WIDTH}
                onChange={(width) => onBlock({ width }, "num:width")}
              />
              <NumberInput
                label="H"
                title={t("editor.height")}
                value={block.height}
                min={40}
                max={SLIDE_HEIGHT}
                onChange={(height) => onBlock({ height }, "num:height")}
              />
            </div>
          </Row>

          <div className="flex flex-wrap gap-1.5">
            <ToolButton icon={<Icon.CenterH />} onClick={() => onCenter("x")}>
              {t("editor.centerH")}
            </ToolButton>
            <ToolButton icon={<Icon.CenterV />} onClick={() => onCenter("y")}>
              {t("editor.centerV")}
            </ToolButton>
            <ToolButton icon={<Icon.Reset />} onClick={onResetBlock}>
              {t("editor.resetBlock")}
            </ToolButton>
            <ToolButton
              icon={<Icon.Trash />}
              onClick={onDeleteBlock}
              disabled={!canDelete}
              title={t("editor.deleteBlockHint")}
            >
              {t("editor.deleteBlock")}
            </ToolButton>
          </div>
        </div>
      )}
    </Section>
  );
}

export function SlideSection({
  slideStyle,
  onSlideStyle,
  src,
  frame,
  mode,
  onMode,
  onPhoto,
  onOpenPicker,
  photoChanged,
  imagePrompt,
  hasPexels,
  regen,
  onRegenerate,
  onDuplicate,
  onRemove,
  canRemove,
  onSaveTemplate,
  canSaveTemplate,
}: {
  slideStyle: OverlayStyle;
  onSlideStyle: (style: OverlayStyle) => void;
  src: string | null;
  frame: PhotoFrame;
  mode: "layout" | "crop";
  onMode: (mode: "layout" | "crop") => void;
  onPhoto: (patch: Partial<PhotoFrame>, history: string) => void;
  onOpenPicker: () => void;
  photoChanged: boolean;
  imagePrompt: string;
  hasPexels: boolean;
  /** This slide's regeneration, or another slide's holding the one slot. */
  regen: { busy: boolean; elsewhere: boolean; error: string | null };
  onRegenerate: (prompt: string, source: "photo" | "generate") => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
  onSaveTemplate: () => void;
  canSaveTemplate: boolean;
}) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(imagePrompt);
  const [source, setSource] = useState<"photo" | "generate">(hasPexels ? "photo" : "generate");

  // A different slide brings its own brief.
  useEffect(() => {
    setPrompt(imagePrompt);
  }, [imagePrompt]);

  const cropping = mode === "crop";
  const framed =
    frame.zoom !== PHOTO_DEFAULTS.zoom ||
    frame.x !== PHOTO_DEFAULTS.x ||
    frame.y !== PHOTO_DEFAULTS.y;

  return (
    <Section title={t("editor.slideSection")}>
      <div className="grid grid-cols-2 gap-1.5">
        <ToolButton wide icon={<Icon.Duplicate />} onClick={onDuplicate}>
          {t("editor.duplicate")}
        </ToolButton>
        <ToolButton wide icon={<Icon.Trash />} onClick={onRemove} disabled={!canRemove}>
          {t("editor.removeSlide")}
        </ToolButton>
      </div>
      <ToolButton
        wide
        icon={<Icon.Bookmark />}
        onClick={onSaveTemplate}
        disabled={!canSaveTemplate}
        title={canSaveTemplate ? t("editor.saveTemplateHint") : t("editor.saveTemplateNoPhoto")}
      >
        {t("editor.saveTemplate")}
      </ToolButton>

      <Row label={t("editor.slideStyle")}>
        <Picker
          options={OVERLAY_STYLES.map((style) => ({ value: style, label: t(STYLE_LABELS[style]) }))}
          value={slideStyle}
          onChange={(v) => onSlideStyle(v as OverlayStyle)}
        />
      </Row>

      <Row label={t("editor.photo")}>
        <div className="flex gap-3">
          <div className="relative aspect-[4/5] w-[74px] shrink-0 overflow-hidden rounded-[9px] bg-[var(--color-line)]">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                draggable={false}
                style={photoLayout(frame) as React.CSSProperties}
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <ToolButton wide icon={<Icon.Image />} onClick={onOpenPicker}>
              {t("editor.photoChange")}
            </ToolButton>
            <ToolButton
              wide
              icon={<Icon.Crop />}
              pressed={cropping}
              onClick={() => onMode(cropping ? "layout" : "crop")}
            >
              {cropping ? t("editor.cropDone") : t("editor.crop")}
            </ToolButton>
            <ToolButton
              wide
              icon={<Icon.Sparkles />}
              pressed={open}
              onClick={() => setOpen((v) => !v)}
            >
              {t("editor.regen")}
            </ToolButton>
          </div>
        </div>
        {photoChanged ? (
          <p className="mt-2 text-[11.5px] leading-snug text-[var(--color-accent)]">
            {t("editor.photoPending")}
          </p>
        ) : null}
      </Row>

      {cropping ? (
        <div className="space-y-2.5 rounded-[12px] bg-[var(--color-surface-muted)] p-3">
          <Row label={t("editor.zoom")} value={`${Math.round(frame.zoom * 100)} %`}>
            <input
              type="range"
              min={1}
              max={PHOTO_MAX_ZOOM}
              step={0.01}
              value={frame.zoom}
              aria-label={t("editor.zoom")}
              onChange={(e) => onPhoto({ zoom: Number(e.target.value) }, "photo:zoom")}
              className="w-full accent-[var(--color-accent)]"
            />
          </Row>
          <p className="text-[11.5px] leading-snug text-[var(--color-ink-soft)]">
            {t("editor.cropHint")}
          </p>
          <ToolButton
            icon={<Icon.Reset />}
            disabled={!framed}
            onClick={() => onPhoto({ ...PHOTO_DEFAULTS }, "photo:reset")}
          >
            {t("editor.cropReset")}
          </ToolButton>
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2.5 rounded-[12px] bg-[var(--color-surface-muted)] p-3">
          <Row label={t("editor.regenPrompt")}>
            <textarea
              value={prompt}
              rows={4}
              maxLength={2000}
              onChange={(e) => setPrompt(e.target.value)}
              className="block w-full resize-y rounded-[10px] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-[12.5px] leading-snug outline-none focus:border-[var(--color-accent)]"
            />
          </Row>
          <Row label={t("editor.regenSource")}>
            <Picker
              options={[
                ...(hasPexels
                  ? [
                      {
                        value: "photo",
                        label: t("editor.regenPhoto"),
                        detail: t("editor.regenPhotoDetail"),
                      },
                    ]
                  : []),
                { value: "generate", label: t("editor.regenGenerate") },
              ]}
              value={source}
              onChange={(v) => setSource(v as "photo" | "generate")}
            />
          </Row>
          {regen.error ? <Notice tone="danger">{regen.error}</Notice> : null}
          <Button
            size="sm"
            variant="primary"
            className="w-full"
            loading={regen.busy}
            disabled={regen.elsewhere || !prompt.trim()}
            onClick={() => onRegenerate(prompt.trim(), source)}
          >
            {regen.busy ? t("editor.regenBusy") : t("editor.regenGo")}
          </Button>
          <p className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
            {regen.elsewhere ? t("editor.regenElsewhere") : t("editor.regenHint")}
          </p>
        </div>
      ) : null}
    </Section>
  );
}

export function AllSlidesSection({
  count,
  onApplyLayout,
  onApplyStyle,
  onResetSlide,
}: {
  count: number;
  onApplyLayout: () => void;
  onApplyStyle: () => void;
  onResetSlide: () => void;
}) {
  const t = translator();
  return (
    <Section title={t("editor.allSection")}>
      {count > 1 ? (
        <>
          <ToolButton wide icon={<Icon.Copy />} onClick={onApplyLayout}>
            {t("editor.applyLayout")}
          </ToolButton>
          <ToolButton wide icon={<Icon.Copy />} onClick={onApplyStyle}>
            {t("editor.applyStyle")}
          </ToolButton>
          <p className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
            {t("editor.applyHint")}
          </p>
        </>
      ) : null}
      <ToolButton wide icon={<Icon.Reset />} onClick={onResetSlide}>
        {t("editor.reset")}
      </ToolButton>
    </Section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice, Picker, Spinner } from "@/components/ui";
import { SlidePreview } from "@/components/tiktok/SlidePreview";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
} from "@/lib/i18n";
import type { SlideOverlay } from "@/lib/overlay";
import { SLIDE_TEXT_LIMITS, hasWords } from "@/lib/slide-text";
import type { SlideTemplate, SlideText } from "@/lib/types";
import { cn } from "@/lib/utils";
import * as Icon from "./icons";
import { EMPTY_WORDS, type SlideWords } from "./state";

export interface TemplateDraft {
  name: string;
  kind: SlideTemplate["kind"];
  mediaId: string;
  overlay: SlideOverlay;
  text: Partial<Record<ContentLocale, SlideWords>>;
}

type Words = Partial<Record<ContentLocale, SlideWords>>;

/**
 * The saved slides, loaded once per opening, with the three ways to change
 * them. Errors come back as messages, in French, ready to show.
 */
export function useSlideTemplates() {
  const t = translator();
  const [templates, setTemplates] = useState<SlideTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/slide-templates");
      const data = (await res.json()) as {
        templates?: SlideTemplate[];
        error?: { message?: string };
      };
      if (!res.ok || !data.templates) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        setTemplates([]);
        return;
      }
      setTemplates(data.templates);
    } catch {
      setError(t("preview.unreachable"));
      setTemplates([]);
    }
    // `t` is a module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Creates, or updates when an id is given. Throws a readable Error on failure. */
  const save = useCallback(async (draft: TemplateDraft, id?: string): Promise<SlideTemplate> => {
    const res = await fetch(id ? `/api/slide-templates/${id}` : "/api/slide-templates", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = (await res.json()) as {
      template?: SlideTemplate;
      error?: { message?: string };
    };
    if (!res.ok || !data.template) {
      throw new Error(data.error?.message ?? translator()("preview.requestFailed"));
    }
    const saved = data.template;
    setTemplates((all) => [saved, ...(all ?? []).filter((x) => x.id !== saved.id)]);
    return saved;
  }, []);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/slide-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(data.error?.message ?? translator()("preview.requestFailed"));
    }
    setTemplates((all) => (all ?? []).filter((x) => x.id !== id));
  }, []);

  return { templates, error, save, remove };
}

/** The languages a saved slide was written in. */
export function writtenIn(text: Partial<Record<ContentLocale, SlideText>>): ContentLocale[] {
  return CONTENT_LOCALES.filter((l) => hasWords(text[l]));
}

// --------------------------------------------------------------- the grid

/**
 * Saved slides as they will look, each with the languages it is written in -
 * and, when a carousel is waiting for it, the ones that carousel needs and it
 * lacks, in red.
 */
export function TemplateGrid({
  templates,
  lang,
  needed,
  search,
  onInsert,
  onEdit,
  onDelete,
}: {
  templates: SlideTemplate[];
  /** The language to preview in, when the slide has it. */
  lang: ContentLocale;
  /** The languages of the carousel it would go into. */
  needed?: ContentLocale[];
  search?: string;
  onInsert?: (template: SlideTemplate) => void;
  onEdit: (template: SlideTemplate) => void;
  onDelete: (template: SlideTemplate) => Promise<void>;
}) {
  const t = translator();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const q = (search ?? "").trim().toLowerCase();
  const shown = q
    ? templates.filter((tpl) =>
        [tpl.name, ...Object.values(tpl.text).flatMap((w) => [w?.title, w?.subtitle, w?.cta])]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(q)),
      )
    : templates;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {shown.map((template) => {
        const written = writtenIn(template.text);
        const preview = written.includes(lang) ? lang : (written[0] ?? lang);
        const missing = (needed ?? []).filter((l) => !written.includes(l));
        return (
          <div
            key={template.id}
            className="overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-accent)]"
          >
            <button
              type="button"
              onClick={() => (onInsert ? onInsert(template) : onEdit(template))}
              className="block w-full text-left"
              title={onInsert ? t("templates.insert") : t("templates.edit")}
            >
              <SlidePreview
                className="w-full"
                src={`/api/media/${encodeURIComponent(template.mediaId)}/raw`}
                copy={template.text[preview] ?? EMPTY_WORDS}
                overlay={template.overlay}
              />
            </button>
            <div className="space-y-1.5 p-2.5">
              <p className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                  {template.name}
                </span>
                {template.kind === "cta" ? (
                  <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-1.5 py-px text-[10.5px] font-semibold text-[var(--color-accent-ink)]">
                    CTA
                  </span>
                ) : null}
              </p>
              <p className="flex flex-wrap gap-1" aria-label={t("templates.languages")}>
                {CONTENT_LOCALES.map((l) => {
                  const has = written.includes(l);
                  const lacking = missing.includes(l);
                  return (
                    <span
                      key={l}
                      title={
                        has
                          ? CONTENT_LOCALE_LABELS[l]
                          : t("templates.missingLang", { lang: CONTENT_LOCALE_LABELS[l] })
                      }
                      className={cn(
                        "rounded-[5px] px-1 text-[10px] font-semibold uppercase",
                        has
                          ? "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]"
                          : lacking
                            ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                            : "text-[var(--color-ink-faint)] opacity-60",
                      )}
                    >
                      {l}
                    </span>
                  );
                })}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(template)}
                  className="flex-1 rounded-[8px] border border-[var(--color-line)] py-1 text-[11.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
                >
                  {t("templates.edit")}
                </button>
                <button
                  type="button"
                  disabled={busy === template.id}
                  onClick={async () => {
                    if (confirming !== template.id) {
                      setConfirming(template.id);
                      return;
                    }
                    setBusy(template.id);
                    try {
                      await onDelete(template);
                    } finally {
                      setBusy(null);
                      setConfirming(null);
                    }
                  }}
                  onBlur={() => setConfirming((c) => (c === template.id ? null : c))}
                  className={cn(
                    "rounded-[8px] px-2 py-1 text-[11.5px] font-medium transition-colors",
                    confirming === template.id
                      ? "bg-[var(--color-danger)] text-white"
                      : "text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]",
                  )}
                >
                  {busy === template.id ? (
                    <Spinner className="size-3" />
                  ) : confirming === template.id ? (
                    t("templates.confirmDelete")
                  ) : (
                    t("templates.delete")
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------- the dialog

/**
 * A saved slide's name, kind and words, in every language.
 *
 * The words are what makes a saved CTA usable in any carousel: written once
 * in each language it may be published in. The empty ones can be proposed
 * by Gemini from any written language - proposed, not saved, until kept.
 */
export function TemplateDialog({
  initial,
  initialLang,
  title,
  onSave,
  onClose,
}: {
  initial: TemplateDraft;
  initialLang: ContentLocale;
  title: string;
  onSave: (draft: TemplateDraft) => Promise<void>;
  onClose: () => void;
}) {
  const t = translator();
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [lang, setLang] = useState<ContentLocale>(initialLang);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const words = draft.text[lang] ?? EMPTY_WORDS;
  const written = writtenIn(draft.text);
  const empty = CONTENT_LOCALES.filter((l) => !written.includes(l));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // An open dropdown inside takes its own Escape first.
      if (document.querySelector('[role="listbox"]')) return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    // Capture: the editor underneath listens on the window too.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function setWords(key: keyof SlideWords, value: string) {
    setDraft((d) => ({
      ...d,
      text: { ...d.text, [lang]: { ...(d.text[lang] ?? EMPTY_WORDS), [key]: value } },
    }));
  }

  async function translate() {
    if (!hasWords(words) || empty.length === 0) return;
    setTranslating(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/slide-templates/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: lang, text: words, to: empty }),
      });
      const data = (await res.json()) as {
        text?: Words;
        error?: { message?: string };
      };
      if (!res.ok || !data.text) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      const proposed = data.text;
      setDraft((d) => {
        const text = { ...d.text };
        // Only languages still empty: nothing already written is overwritten.
        for (const l of empty) {
          const p = proposed[l];
          if (p && !hasWords(text[l])) text[l] = { ...EMPTY_WORDS, ...p };
        }
        return { ...d, text };
      });
      setNote(
        t("templates.translated", {
          langs: empty.map((l) => CONTENT_LOCALE_LABELS[l]).join(", "),
        }),
      );
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setTranslating(false);
    }
  }

  async function save() {
    if (!draft.name.trim()) {
      setError(t("templates.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, name: draft.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("preview.requestFailed"));
      setSaving(false);
    }
  }

  const FIELDS: { key: keyof SlideWords; label: string; rows: number }[] = [
    { key: "title", label: t("editor.blockTitle"), rows: 2 },
    { key: "subtitle", label: t("editor.blockSubtitle"), rows: 2 },
    { key: "cta", label: t("editor.blockCta"), rows: 2 },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-raised)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-3.5">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("editor.close")}
            className="grid size-8 place-items-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
          >
            <Icon.Close />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div className="space-y-2">
            <SlidePreview
              className="w-full rounded-[12px]"
              src={`/api/media/${encodeURIComponent(draft.mediaId)}/raw`}
              copy={words}
              overlay={draft.overlay}
            />
            <p className="text-center text-[11.5px] text-[var(--color-ink-faint)]">
              {t("templates.previewIn", { lang: CONTENT_LOCALE_LABELS[lang] })}
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[var(--color-ink-soft)]">
                  {t("templates.name")}
                </span>
                <input
                  value={draft.name}
                  maxLength={80}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="w-full rounded-[10px] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--color-accent)]"
                />
              </label>
              <div>
                <span className="mb-1 block text-[12px] font-medium text-[var(--color-ink-soft)]">
                  {t("templates.kind")}
                </span>
                <Picker
                  options={[
                    { value: "cta", label: t("templates.kindCta") },
                    { value: "content", label: t("templates.kindContent") },
                  ]}
                  value={draft.kind}
                  onChange={(v) => setDraft((d) => ({ ...d, kind: v === "cta" ? "cta" : "content" }))}
                />
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-soft)]">
                {t("templates.wordsPerLanguage")}
              </span>
              <div
                role="tablist"
                aria-label={t("templates.languages")}
                className="flex flex-wrap gap-1 rounded-full bg-[var(--color-surface-muted)] p-1"
              >
                {CONTENT_LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={l === lang}
                    onClick={() => setLang(l)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors",
                      l === lang
                        ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
                        : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                    )}
                  >
                    {CONTENT_LOCALE_LABELS[l]}
                    {written.includes(l) ? (
                      <span className="text-[var(--color-accent)]" aria-label={t("templates.written")}>
                        <Icon.Check />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 flex items-center justify-between text-[12px] font-medium text-[var(--color-ink-soft)]">
                  {field.label}
                  <span className="text-[11px] text-[var(--color-ink-faint)] tabular-nums">
                    {words[field.key].length}/{SLIDE_TEXT_LIMITS[field.key]}
                  </span>
                </span>
                <textarea
                  value={words[field.key]}
                  rows={field.rows}
                  maxLength={SLIDE_TEXT_LIMITS[field.key]}
                  onChange={(e) => setWords(field.key, e.target.value)}
                  className="block w-full resize-y rounded-[10px] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-[13.5px] leading-snug outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
                />
              </label>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void translate()}
                loading={translating}
                disabled={!hasWords(words) || empty.length === 0}
              >
                {translating ? null : <Icon.Sparkles />}
                {empty.length === 0
                  ? t("templates.allWritten")
                  : t("templates.translate", {
                      from: CONTENT_LOCALE_LABELS[lang],
                      n: empty.length,
                    })}
              </Button>
              <span className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
                {t("templates.translateHint")}
              </span>
            </div>

            {note ? <Notice tone="info">{note}</Notice> : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            {t("templates.cancel")}
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} loading={saving}>
            {t("templates.save")}
          </Button>
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button, Notice, Spinner } from "@/components/ui";
import { EditorCanvas, type CanvasIssue } from "@/components/tiktok/editor/EditorCanvas";
import { Filmstrip, type FilmstripItem } from "@/components/tiktok/editor/Filmstrip";
import * as Icon from "@/components/tiktok/editor/icons";
import {
  AllSlidesSection,
  BLOCK_LABELS,
  BlockSection,
  SlideSection,
  TextSection,
} from "@/components/tiktok/editor/Inspector";
import { PhotoPicker, type PickerTab } from "@/components/tiktok/editor/PhotoPicker";
import {
  draftsFrom,
  editorReducer,
  frameOf,
  initialEditorState,
  photoChanged,
  sameDraft,
  withLayoutOf,
  withStyleOf,
  wordsOf,
  type BlockKey,
  type SlideDraft,
} from "@/components/tiktok/editor/state";
import { captureSlide } from "@/lib/capture";
import type { PlantIdentity } from "@/lib/data/localize";
import {
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
  type TranslationKey,
} from "@/lib/i18n";
import {
  PHOTO_DEFAULTS,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  defaultOverlay,
  normaliseOverlay,
  type OverlayBlock,
  type OverlayStyle,
  type PhotoFrame,
} from "@/lib/overlay";
import { slideImageSrc } from "@/lib/slide-image";
import type { CarouselRecord, MediaAsset } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  carousel: CarouselRecord;
  /** The slide to open on. */
  index: number;
  language: ContentLocale;
  /** The catalog, so library pictures carry both of their plant's names. */
  plants?: PlantIdentity[];
  hasPexels?: boolean;
  /** Closed with nothing saved. */
  onClose: () => void;
  /** Closed after at least one save, with the carousel as the server has it. */
  onSaved: (carousel: CarouselRecord) => void;
}

const SHORTCUTS: [string, TranslationKey][] = [
  ["Glisser", "editor.keyMove"],
  ["Coins", "editor.keyCorner"],
  ["Côtés", "editor.keySide"],
  ["Double-clic · Entrée", "editor.keyWrite"],
  ["← ↑ → ↓ · Maj", "editor.keyNudge"],
  ["Page préc. / suiv. · Alt ← →", "editor.keySlides"],
  ["Ctrl Z · Ctrl Maj Z", "editor.keyUndo"],
  ["Ctrl S", "editor.keySave"],
  ["R", "editor.keyCrop"],
  ["T · G", "editor.keyGuides"],
  ["Échap", "editor.keyEscape"],
];

/**
 * The carousel editor: every slide, one workspace.
 *
 * The filmstrip on the left is the carousel, drawn live from the draft; the
 * slide in the middle is the real 1080x1350 composition, dragged and typed on
 * directly; the inspector on the right holds the words, the selected block's
 * look, the photograph and the carousel-wide actions.
 *
 * Nothing is written until "Enregistrer": the draft covers the whole carousel,
 * undo covers the whole draft, and one save sends every slide that changed.
 * Words belong to a language; position, size, style and photograph belong to
 * the slide - editing French does not move the English text, which is the
 * only way several translations stay one design.
 */
export function SlideEditor({
  carousel,
  index,
  language,
  plants = [],
  hasPexels = false,
  onClose,
  onSaved,
}: Props) {
  const t = translator();

  const [state, dispatch] = useReducer(editorReducer, null, () =>
    initialEditorState(draftsFrom(carousel), index),
  );
  /** The slides as the server last confirmed them, to tell what changed. */
  const [baseline, setBaseline] = useState<SlideDraft[]>(() => draftsFrom(carousel));
  /** The carousel as the last save returned it. */
  const [saved, setSaved] = useState<CarouselRecord | null>(null);

  const [lang, setLang] = useState<ContentLocale>(
    carousel.languages.includes(language) ? language : (carousel.languages[0] ?? language),
  );
  const [selected, setSelected] = useState<BlockKey | null>("title");
  const [editing, setEditing] = useState<BlockKey | null>(null);
  const [mode, setMode] = useState<"layout" | "crop">("layout");
  const [showZones, setShowZones] = useStoredFlag("plenova.editor.zones", true);
  const [showGrid, setShowGrid] = useStoredFlag("plenova.editor.grid", false);
  const [issues, setIssues] = useState<CanvasIssue[]>([]);
  const [picker, setPicker] = useState<PickerTab | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const [regen, setRegen] = useState<{
    index: number;
    busy: boolean;
    error: string | null;
  } | null>(null);

  // Read by async work and window listeners, which must not act on a stale render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  const savedRef = useRef<CarouselRecord | null>(null);
  const savingRef = useRef(false);

  const record = saved ?? carousel;
  const active = state.active;
  const slide = state.slides[active];
  const total = state.slides.length;

  const dirty = useMemo(
    () => state.slides.map((s, i) => !sameDraft(s, baseline[i])),
    [state.slides, baseline],
  );
  const dirtyCount = dirty.filter(Boolean).length;

  // ------------------------------------------------------------- the photos

  /*
   * A photograph already on the slide comes through the slide's own route,
   * keyed by which picture it is; one picked in this session and not yet
   * saved comes through the library's. Both are same-origin, which is what
   * lets an export draw them into a canvas.
   */
  const photoSrc = useCallback(
    (i: number): string | null => {
      const draft = state.slides[i];
      const stored = record.slides[i];
      if (!draft) return null;
      if (stored && draft.mediaId === stored.mediaId && draft.imageUrl === stored.imageUrl) {
        return stored.imageUrl ? slideImageSrc(record.id, i, stored) : null;
      }
      if (draft.mediaId) return `/api/media/${encodeURIComponent(draft.mediaId)}/raw`;
      return draft.imageUrl;
    },
    [state.slides, record],
  );

  // ------------------------------------------------------------------ edits

  const edit = useCallback(
    (key: string, fn: (s: SlideDraft) => SlideDraft, at?: number) => {
      dispatch({ type: "edit", key, at: Date.now(), index: at, fn });
    },
    [],
  );

  const setText = useCallback(
    (key: BlockKey, value: string) => {
      edit(`text:${lang}:${key}`, (s) => ({
        ...s,
        text: { ...s.text, [lang]: { ...wordsOf(s, lang), [key]: value } },
      }));
    },
    [edit, lang],
  );

  const setBlock = useCallback(
    (key: BlockKey, patch: Partial<OverlayBlock>, history: string) => {
      edit(history, (s) => ({
        ...s,
        overlay: { ...s.overlay, [key]: { ...s.overlay[key], ...patch } },
      }));
    },
    [edit],
  );

  const setPhoto = useCallback(
    (patch: Partial<PhotoFrame>, history: string) => {
      edit(history, (s) => ({
        ...s,
        overlay: { ...s.overlay, photo: { ...frameOf(s.overlay), ...patch } },
      }));
    },
    [edit],
  );

  const go = useCallback((i: number) => {
    setEditing(null);
    setMode("layout");
    dispatch({ type: "go", index: i });
  }, []);

  const flash = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function applyAsset(asset: MediaAsset, at: number, prompt?: string) {
    edit(
      `photo:${asset.id}`,
      (s) =>
        s.mediaId === asset.id
          ? s
          : {
              ...s,
              mediaId: asset.id,
              imageUrl: asset.url,
              ...(prompt !== undefined ? { imagePrompt: prompt } : {}),
              // A new picture starts centred: the old framing was for the old one.
              overlay: { ...s.overlay, photo: { ...PHOTO_DEFAULTS } },
            },
      at,
    );
  }

  async function regenerate(prompt: string, source: "photo" | "generate") {
    if (regen?.busy) return;
    const at = active;
    setRegen({ index: at, busy: true, error: null });
    try {
      const res = await fetch(`/api/carousels/${carousel.id}/slides/${at}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, source }),
      });
      const data = (await res.json()) as {
        asset?: MediaAsset;
        error?: { message?: string };
      };
      if (!res.ok || !data.asset) {
        setRegen({
          index: at,
          busy: false,
          error: data.error?.message ?? t("preview.requestFailed"),
        });
        return;
      }
      applyAsset(data.asset, at, prompt);
      setRegen(null);
      flash(t("editor.regenDone", { n: at + 1 }));
    } catch {
      setRegen({ index: at, busy: false, error: t("preview.unreachable") });
    }
  }

  function applyToAll(kind: "layout" | "style") {
    const source = stateRef.current.slides[active];
    if (!source || total < 2) return;
    dispatch({
      type: "editAll",
      key: `all:${kind}:${Date.now()}`,
      at: Date.now(),
      fn: (s, i) =>
        i === active ? s : kind === "layout" ? withLayoutOf(s, source) : withStyleOf(s, source),
    });
    flash(t(kind === "layout" ? "editor.appliedLayout" : "editor.appliedStyle", { n: total - 1 }));
  }

  function centre(axis: "x" | "y") {
    if (!selected) return;
    setBlock(
      selected,
      axis === "x" ? { x: SLIDE_WIDTH / 2 } : { y: SLIDE_HEIGHT / 2 },
      `${selected}:centre:${axis}`,
    );
  }

  function resetBlock() {
    if (!selected || !slide) return;
    setBlock(selected, { ...defaultOverlay(slide.overlay.style)[selected] }, `${selected}:reset`);
  }

  function resetSlide() {
    edit("slide:reset", (s) => ({
      ...s,
      overlay: { ...defaultOverlay(s.overlay.style), photo: s.overlay.photo },
    }));
  }

  function setSlideStyle(style: OverlayStyle) {
    edit("slide:style", (s) => ({ ...s, overlay: { ...s.overlay, style } }));
  }

  // ----------------------------------------------------------------- saving

  /**
   * Sends every slide that differs from the last confirmed state, one by one.
   *
   * The baseline of each slide becomes exactly what was sent, so anything
   * typed while the request was in flight still shows as unsaved. A failure
   * stops the run and names the slide; the ones before it are saved.
   */
  async function save(): Promise<boolean> {
    if (savingRef.current) return false;
    const targets = stateRef.current.slides
      .map((s, i) => (sameDraft(s, baselineRef.current[i]) ? -1 : i))
      .filter((i) => i >= 0);
    if (targets.length === 0) return true;

    savingRef.current = true;
    setSaving(true);
    setError(null);
    let latest: CarouselRecord | null = null;
    try {
      for (const i of targets) {
        const draft = stateRef.current.slides[i];
        if (!draft) continue;
        const before = baselineRef.current[i];
        const body: Record<string, unknown> = {
          text: draft.text,
          overlay: normaliseOverlay(draft.overlay),
        };
        if (photoChanged(draft, before) && draft.mediaId) body.mediaId = draft.mediaId;
        if (draft.imagePrompt !== (before?.imagePrompt ?? "")) {
          body.imagePrompt = draft.imagePrompt;
        }

        const res = await fetch(`/api/carousels/${carousel.id}/slides/${i}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          carousel?: CarouselRecord;
          error?: { message?: string };
        };
        if (!res.ok || !data.carousel) {
          setError(
            t("editor.saveFailed", {
              n: i + 1,
              reason: data.error?.message ?? t("preview.requestFailed"),
            }),
          );
          return false;
        }
        latest = data.carousel;
        const next = baselineRef.current.slice();
        next[i] = draft;
        baselineRef.current = next;
        setBaseline(next);
      }
      flash(t("editor.savedFlash"));
      return true;
    } catch {
      setError(t("preview.unreachable"));
      return false;
    } finally {
      if (latest) {
        savedRef.current = latest;
        setSaved(latest);
      }
      savingRef.current = false;
      setSaving(false);
    }
  }

  /** Leaves, handing back the carousel if anything was saved on the way. */
  function finish() {
    const latest = savedRef.current;
    if (latest) onSaved(latest);
    else onClose();
  }

  function requestClose() {
    if (savingRef.current) return;
    const unsaved = stateRef.current.slides.some(
      (s, i) => !sameDraft(s, baselineRef.current[i]),
    );
    if (unsaved) setConfirmClose(true);
    else finish();
  }

  // ---------------------------------------------------------------- export

  /** The slides as JPEGs, in the language on screen, exactly as they would be published. */
  async function exportSlides(which: "one" | "all") {
    setExportMenu(false);
    const indexes = which === "one" ? [active] : state.slides.map((_, i) => i);
    const stem = fileStem(carousel.theme);
    setExporting({ done: 0, total: indexes.length });
    setError(null);
    const failed: number[] = [];
    for (const [n, i] of indexes.entries()) {
      const draft = state.slides[i];
      const src = photoSrc(i);
      if (!draft || !src) {
        failed.push(i);
        continue;
      }
      const words = wordsOf(draft, lang);
      try {
        const dataUrl = await captureSlide({
          src,
          overlay: draft.overlay,
          title: words.title,
          subtitle: words.subtitle,
          cta: words.cta,
        });
        download(dataUrl, `${stem}-${lang}-slide-${String(i + 1).padStart(2, "0")}.jpg`);
        // Browsers drop downloads fired in the same instant.
        if (indexes.length > 1) await new Promise((r) => window.setTimeout(r, 350));
      } catch {
        failed.push(i);
      }
      setExporting({ done: n + 1, total: indexes.length });
    }
    setExporting(null);
    if (failed.length > 0) {
      setError(t("editor.exportFailed", { slides: failed.map((i) => i + 1).join(", ") }));
    } else {
      flash(t("editor.exported", { n: indexes.length }));
    }
  }

  // ------------------------------------------------------------ side effects

  // The page behind must not scroll under the workspace - it would also move
  // the anchor every dropdown list is positioned against.
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (dirtyCount === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyCount]);

  useEffect(() => {
    if (!exportMenu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest("[data-export-menu]")) {
        setExportMenu(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [exportMenu]);

  /*
   * The keyboard. Escape backs out one layer at a time - a menu, a dialog,
   * the text being typed, the reframing - and only then asks to leave.
   * Everything else stays out of the way of a field being typed in, except
   * undo, redo and save, which work from anywhere.
   */
  const onKey = useRef<(event: KeyboardEvent) => void>(() => {});
  onKey.current = (event) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    const typing =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    const lower = key.toLowerCase();

    if (key === "Escape") {
      event.preventDefault();
      if (exportMenu) return setExportMenu(false);
      if (helpOpen) return setHelpOpen(false);
      if (picker) return setPicker(null);
      if (confirmClose) return setConfirmClose(false);
      if (editing) return setEditing(null);
      if (mode === "crop") return setMode("layout");
      if (typing && target) return target.blur();
      requestClose();
      return;
    }
    // The dialogs own the keyboard while they are open.
    if (picker || confirmClose || helpOpen) return;

    if (mod && lower === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (mod && (lower === "z" || lower === "y")) {
      event.preventDefault();
      setEditing(null);
      dispatch({ type: lower === "y" || event.shiftKey ? "redo" : "undo" });
      return;
    }
    if (typing) return;

    if (key === "PageDown" || (event.altKey && key === "ArrowRight")) {
      event.preventDefault();
      go(Math.min(active + 1, total - 1));
      return;
    }
    if (key === "PageUp" || (event.altKey && key === "ArrowLeft")) {
      event.preventDefault();
      go(Math.max(active - 1, 0));
      return;
    }
    if (mod || event.altKey) return;

    if (key === "?") return setHelpOpen(true);
    if (lower === "g") return setShowGrid((v) => !v);
    if (lower === "t") return setShowZones((v) => !v);
    if (lower === "r") {
      setEditing(null);
      return setMode((m) => (m === "crop" ? "layout" : "crop"));
    }
    if (key === "Enter" && selected && mode === "layout") {
      event.preventDefault();
      setEditing(selected);
      return;
    }

    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[key];
    if (!move || !slide) return;
    event.preventDefault();
    if (mode === "crop") {
      const f = frameOf(slide.overlay);
      setPhoto(
        {
          x: clamp(f.x + move[0] * 0.5, 0, 100),
          y: clamp(f.y + move[1] * 0.5, 0, 100),
        },
        "photo:nudge",
      );
      return;
    }
    if (!selected) return;
    const b = slide.overlay[selected];
    setBlock(
      selected,
      {
        x: clamp(b.x + move[0], 20, SLIDE_WIDTH - 20),
        y: clamp(b.y + move[1], 20, SLIDE_HEIGHT - 20),
      },
      `nudge:${selected}`,
    );
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  if (!slide) return null;

  // ------------------------------------------------------------------ render

  const words = wordsOf(slide, lang);
  const src = photoSrc(active);
  const labels: Record<BlockKey, string> = {
    title: t(BLOCK_LABELS.title),
    subtitle: t(BLOCK_LABELS.subtitle),
    cta: t(BLOCK_LABELS.cta),
  };
  const isMention = Boolean(carousel.slides[active]?.hasPlenovaMention);
  const block = selected ? slide.overlay[selected] : null;
  const photoIsNew = photoChanged(slide, baseline[active]);
  const plant = plants.find((p) => p.slug === carousel.plantSlug) ?? null;
  const missingIn = (l: ContentLocale) =>
    state.slides.filter((s) => !wordsOf(s, l).title.trim()).length;

  const items: FilmstripItem[] = state.slides.map((s, i) => ({
    src: photoSrc(i),
    overlay: s.overlay,
    words: wordsOf(s, lang),
    dirty: dirty[i] ?? false,
    missing: !wordsOf(s, lang).title.trim(),
    mention: Boolean(carousel.slides[i]?.hasPlenovaMention),
  }));

  const issueText = (issue: CanvasIssue) =>
    t(
      issue.kind === "rail"
        ? "editor.issueRail"
        : issue.kind === "caption"
          ? "editor.issueCaption"
          : "editor.issueOutside",
      { block: labels[issue.block] },
    );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-canvas)]"
      role="dialog"
      aria-modal="true"
      aria-label={t("editor.workspace")}
    >
      {/* ------------------------------------------------------ toolbar */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
        <BarButton label={t("editor.close")} onClick={requestClose}>
          <Icon.Close />
          <span className="hidden sm:inline">{t("editor.close")}</span>
        </BarButton>

        <div className="hidden min-w-0 md:block">
          <p className="text-[13.5px] leading-tight font-semibold">{t("editor.workspace")}</p>
          <p className="max-w-[240px] truncate text-[11.5px] text-[var(--color-ink-faint)]">
            {carousel.theme}
          </p>
        </div>

        <div className="flex items-center gap-0.5">
          <BarButton
            label={t("editor.prev")}
            onClick={() => go(active - 1)}
            disabled={active === 0}
          >
            <Icon.ChevronLeft />
          </BarButton>
          <span className="min-w-[84px] text-center text-[13px] font-semibold tabular-nums">
            {t("editor.slideOf", { n: active + 1, total })}
          </span>
          <BarButton
            label={t("editor.next")}
            onClick={() => go(active + 1)}
            disabled={active >= total - 1}
          >
            <Icon.ChevronRight />
          </BarButton>
        </div>

        {carousel.languages.length > 1 ? (
          <div
            role="tablist"
            aria-label={t("editor.displayLanguage")}
            className="flex gap-0.5 rounded-full bg-[var(--color-surface-muted)] p-1"
          >
            {carousel.languages.map((l) => {
              const missing = missingIn(l);
              return (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={l === lang}
                  title={
                    missing > 0
                      ? t("editor.langMissing", { n: missing, lang: CONTENT_LOCALE_LABELS[l] })
                      : CONTENT_LOCALE_LABELS[l]
                  }
                  onClick={() => {
                    setEditing(null);
                    setLang(l);
                  }}
                  className={cn(
                    "relative rounded-full px-3 py-1 text-[12.5px] font-semibold uppercase transition-colors",
                    l === lang
                      ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
                      : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                  )}
                >
                  {l}
                  {missing > 0 ? (
                    <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-[var(--color-danger)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <BarButton
            label={`${t("editor.zones")} (T)`}
            pressed={showZones}
            onClick={() => setShowZones((v) => !v)}
          >
            <Icon.Phone />
            <span className="hidden xl:inline">{t("editor.zones")}</span>
          </BarButton>
          <BarButton
            label={`${t("editor.grid")} (G)`}
            pressed={showGrid}
            onClick={() => setShowGrid((v) => !v)}
          >
            <Icon.Grid />
            <span className="hidden xl:inline">{t("editor.grid")}</span>
          </BarButton>

          <span className="mx-1 h-5 w-px bg-[var(--color-line-strong)]" aria-hidden />

          <BarButton
            label={`${t("editor.undo")} (Ctrl+Z)`}
            onClick={() => {
              setEditing(null);
              dispatch({ type: "undo" });
            }}
            disabled={state.past.length === 0}
          >
            <Icon.Undo />
          </BarButton>
          <BarButton
            label={`${t("editor.redo")} (Ctrl+Maj+Z)`}
            onClick={() => {
              setEditing(null);
              dispatch({ type: "redo" });
            }}
            disabled={state.future.length === 0}
          >
            <Icon.Redo />
          </BarButton>

          <span className="mx-1 h-5 w-px bg-[var(--color-line-strong)]" aria-hidden />

          <div className="relative" data-export-menu>
            <BarButton
              label={t("editor.export")}
              pressed={exportMenu}
              disabled={exporting !== null}
              onClick={() => setExportMenu((v) => !v)}
            >
              {exporting ? <Spinner /> : <Icon.Download />}
              <span className="hidden lg:inline">
                {exporting
                  ? t("editor.exporting", { done: exporting.done, total: exporting.total })
                  : t("editor.export")}
              </span>
            </BarButton>
            {exportMenu ? (
              <div
                role="menu"
                className="absolute top-full right-0 z-10 mt-1.5 w-72 rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-raised)]"
              >
                {(["one", "all"] as const).map((which) => (
                  <button
                    key={which}
                    type="button"
                    role="menuitem"
                    onClick={() => void exportSlides(which)}
                    className="block w-full rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
                  >
                    <span className="block text-[13.5px] font-medium">
                      {which === "one"
                        ? t("editor.exportOne", { n: active + 1 })
                        : t("editor.exportAll", { n: total })}
                    </span>
                    <span className="block text-[11.5px] text-[var(--color-ink-faint)]">
                      {t("editor.exportDetail", { lang: CONTENT_LOCALE_LABELS[lang] })}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <BarButton label={`${t("editor.shortcuts")} (?)`} onClick={() => setHelpOpen(true)}>
            <Icon.Keyboard />
          </BarButton>

          <Button
            size="sm"
            variant={dirtyCount > 0 ? "primary" : "secondary"}
            onClick={() => void save()}
            loading={saving}
            disabled={dirtyCount === 0 && !saving}
            className="ml-1"
            title="Ctrl+S"
          >
            {saving ? null : dirtyCount === 0 ? <Icon.Check /> : null}
            {saving
              ? t("editor.saving")
              : dirtyCount > 0
                ? t("editor.saveCount", { n: dirtyCount })
                : t("editor.saved")}
          </Button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-[var(--color-line)] bg-[var(--color-danger-soft)] px-4 py-2">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 text-[13px] text-[var(--color-danger)]">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label={t("editor.close")}
              className="shrink-0 rounded-full p-1 hover:bg-black/5"
            >
              <Icon.Close />
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[118px_minmax(0,1fr)_360px] lg:overflow-hidden xl:grid-cols-[128px_minmax(0,1fr)_380px]">
        <div className="border-b border-[var(--color-line)] bg-[var(--color-surface-muted)]/60 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <Filmstrip
            items={items}
            active={active}
            onGo={go}
            label={(i) => t("editor.slideOf", { n: i + 1, total })}
          />
        </div>

        <main className="flex min-w-0 flex-col items-center px-4 py-5 lg:min-h-0 lg:overflow-y-auto lg:px-8">
          <div
            className="my-auto w-full space-y-3"
            style={{ maxWidth: "min(100%, calc((100dvh - 200px) * 0.8))" }}
          >
            {mode === "crop" ? (
              <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--color-ink-fill)] px-3.5 py-2 text-[12.5px] text-[var(--color-canvas)]">
                <span className="flex items-center gap-2">
                  <Icon.Crop />
                  {t("editor.cropHint")}
                </span>
                <button
                  type="button"
                  onClick={() => setMode("layout")}
                  className="shrink-0 rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25"
                >
                  {t("editor.cropDone")}
                </button>
              </div>
            ) : null}

            <EditorCanvas
              overlay={slide.overlay}
              words={words}
              src={src}
              selected={selected}
              mode={mode}
              editing={editing}
              showZones={showZones}
              showGrid={showGrid}
              labels={labels}
              onSelect={setSelected}
              onStartEditing={(key) => {
                setSelected(key);
                setEditing(key);
              }}
              onStopEditing={() => setEditing(null)}
              onText={setText}
              onBlock={setBlock}
              onPhoto={setPhoto}
              onIssues={setIssues}
              onImageError={() => {
                if (src) setBroken((b) => new Set(b).add(src));
              }}
            />

            {src && broken.has(src) ? (
              <Notice tone="danger">{t("editor.imageBroken")}</Notice>
            ) : null}

            {issues.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {issues.map((issue) => (
                  <span
                    key={`${issue.block}-${issue.kind}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warn-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-warn-ink)]"
                  >
                    <Icon.Warning />
                    {issueText(issue)}
                  </span>
                ))}
                {!showZones && issues.some((i) => i.kind !== "outside") ? (
                  <button
                    type="button"
                    onClick={() => setShowZones(() => true)}
                    className="rounded-full px-2 py-1 text-[12px] font-medium text-[var(--color-accent)] hover:underline"
                  >
                    {t("editor.showZones")}
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="text-center text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
              {showZones ? `${t("editor.zonesHint")} ` : ""}
              {t("editor.canvasHint")}
            </p>
          </div>
        </main>

        <aside className="border-t border-[var(--color-line)] bg-[var(--color-surface)] lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <TextSection
            words={words}
            lang={lang}
            selected={selected}
            isMention={isMention}
            onSelect={setSelected}
            onText={setText}
          />
          <BlockSection
            selected={selected}
            block={block}
            slideStyle={slide.overlay.style}
            onSelect={setSelected}
            onBlock={(patch, field) => {
              if (selected) setBlock(selected, patch, `${selected}:${field}`);
            }}
            onCenter={centre}
            onResetBlock={resetBlock}
          />
          <SlideSection
            slideStyle={slide.overlay.style}
            onSlideStyle={setSlideStyle}
            src={src}
            frame={frameOf(slide.overlay)}
            mode={mode}
            onMode={(m) => {
              setEditing(null);
              setMode(m);
            }}
            onPhoto={setPhoto}
            onOpenPicker={() => setPicker(isMention ? "cta" : plant ? "plant" : "all")}
            photoChanged={photoIsNew}
            imagePrompt={slide.imagePrompt}
            hasPexels={hasPexels}
            regen={{
              busy: regen?.busy === true && regen.index === active,
              elsewhere: regen?.busy === true && regen.index !== active,
              error: regen && regen.index === active ? regen.error : null,
            }}
            onRegenerate={(prompt, source) => void regenerate(prompt, source)}
          />
          <AllSlidesSection
            count={total}
            onApplyLayout={() => applyToAll("layout")}
            onApplyStyle={() => applyToAll("style")}
            onResetSlide={resetSlide}
          />
        </aside>
      </div>

      {/* ------------------------------------------------------ layers */}
      {picker ? (
        <PhotoPicker
          plantSlug={carousel.plantSlug}
          plantLabel={plant?.primary ?? carousel.plantName}
          currentId={slide.mediaId}
          plants={plants}
          initialTab={picker}
          onPick={(asset) => {
            applyAsset(asset, active);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {helpOpen ? (
        <Layer onDismiss={() => setHelpOpen(false)} label={t("editor.shortcuts")}>
          <h3 className="text-[16px] font-semibold">{t("editor.shortcuts")}</h3>
          <dl className="mt-3 divide-y divide-[var(--color-line)]">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={what} className="flex items-center justify-between gap-4 py-2 text-[13px]">
                <dt className="text-[var(--color-ink-soft)]">{t(what)}</dt>
                <dd>
                  <kbd className="rounded-[7px] border border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] px-2 py-0.5 font-sans text-[12px] font-semibold whitespace-nowrap">
                    {keys}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={() => setHelpOpen(false)}>
              {t("editor.close")}
            </Button>
          </div>
        </Layer>
      ) : null}

      {confirmClose ? (
        <Layer onDismiss={() => setConfirmClose(false)} label={t("editor.unsavedTitle")}>
          <h3 className="text-[16px] font-semibold">{t("editor.unsavedTitle")}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
            {t("editor.unsavedBody", { n: dirtyCount })}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmClose(false)}>
              {t("editor.keepEditing")}
            </Button>
            <Button size="sm" variant="secondary" onClick={finish}>
              {t("editor.discard")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              onClick={async () => {
                const ok = await save();
                if (ok) finish();
                else setConfirmClose(false);
              }}
            >
              {t("editor.saveAndClose")}
            </Button>
          </div>
        </Layer>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[var(--color-ink-fill)] px-4 py-2 text-[13px] font-medium text-[var(--color-canvas)] shadow-[var(--shadow-raised)]"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function BarButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35",
        pressed
          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
          : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]",
      )}
    >
      {children}
    </button>
  );
}

/** A small dialog above the workspace. */
function Layer({
  label,
  onDismiss,
  children,
}: {
  label: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-raised)]"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A remembered on/off switch for this browser - the guides the operator
 * likes to see. Storage can be refused (private windows); the switch then
 * simply starts from its default every time.
 */
function useStoredFlag(
  key: string,
  fallback: boolean,
): [boolean, (update: (value: boolean) => boolean) => void] {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(raw === "1");
    } catch {
      // Unavailable storage: keep the default.
    }
  }, [key]);
  const update = useCallback(
    (fn: (value: boolean) => boolean) => {
      setValue((current) => {
        const next = fn(current);
        try {
          window.localStorage.setItem(key, next ? "1" : "0");
        } catch {
          // Unavailable storage: the switch still works for this session.
        }
        return next;
      });
    },
    [key],
  );
  return [value, update];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function download(dataUrl: string, name: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** "Top 5 des pothos rares" -> "top-5-des-pothos-rares", for file names. */
function fileStem(theme: string): string {
  const stem = theme
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return stem || "carrousel";
}

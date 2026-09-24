import type { ContentLocale } from "@/lib/i18n";
import {
  PHOTO_DEFAULTS,
  defaultOverlay,
  normaliseOverlay,
  type OverlayBlock,
  type PhotoFrame,
  type SlideOverlay,
} from "@/lib/overlay";
import type { CarouselRecord } from "@/lib/types";

/**
 * The editor's model: the whole carousel as a draft, and its history.
 *
 * The editor used to hold one slide and forget it on close. Editing a
 * carousel is rarely one slide, though - it is lining seven of them up - so
 * the draft now covers every slide, moving between them costs nothing, and
 * one save writes whatever changed.
 */

export type BlockKey = "title" | "subtitle" | "cta";
export const BLOCKS: BlockKey[] = ["title", "subtitle", "cta"];

/** What the server keeps of each block's words; the editor stops at the same place. */
export const TEXT_LIMITS: Record<BlockKey, number> = {
  title: 400,
  subtitle: 600,
  cta: 400,
};

export interface SlideWords {
  title: string;
  subtitle: string;
  cta: string;
}

export const EMPTY_WORDS: SlideWords = { title: "", subtitle: "", cta: "" };

export interface SlideDraft {
  /** Normalised on the way in, so every field exists and compares cleanly. */
  overlay: SlideOverlay;
  text: Partial<Record<ContentLocale, SlideWords>>;
  mediaId: string | null;
  imageUrl: string | null;
  imagePrompt: string;
}

export function draftsFrom(carousel: CarouselRecord): SlideDraft[] {
  return carousel.slides.map((slide) => {
    const text: SlideDraft["text"] = {};
    for (const lang of carousel.languages) {
      text[lang] = {
        title: slide.text[lang]?.title ?? "",
        subtitle: slide.text[lang]?.subtitle ?? "",
        cta: slide.text[lang]?.cta ?? "",
      };
    }
    return {
      overlay: slide.overlay ? normaliseOverlay(slide.overlay) : defaultOverlay(),
      text,
      mediaId: slide.mediaId,
      imageUrl: slide.imageUrl,
      imagePrompt: slide.imagePrompt ?? "",
    };
  });
}

export function wordsOf(slide: SlideDraft | undefined, lang: ContentLocale): SlideWords {
  return slide?.text[lang] ?? EMPTY_WORDS;
}

export function sameDraft(a: SlideDraft | undefined, b: SlideDraft | undefined): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function photoChanged(a: SlideDraft | undefined, b: SlideDraft | undefined): boolean {
  return a?.mediaId !== b?.mediaId || a?.imageUrl !== b?.imageUrl;
}

export function frameOf(overlay: SlideOverlay): PhotoFrame {
  return overlay.photo ?? PHOTO_DEFAULTS;
}

/*
 * What "the layout" and "the style" of a slide mean when copied onto others.
 *
 * The layout is everything about the text: where each block sits, how big it
 * is, how it looks. The style is only the look - so a carousel whose titles
 * sit at different heights on purpose can still be recoloured in one go.
 * Neither ever carries the words or the photograph's framing, which belong to
 * each slide.
 */
const STYLE_FIELDS = [
  "fontWeight",
  "lineHeight",
  "align",
  "style",
  "strokeColor",
  "strokeWidth",
  "color",
] as const satisfies readonly (keyof OverlayBlock)[];

export function withLayoutOf(target: SlideDraft, source: SlideDraft): SlideDraft {
  return {
    ...target,
    overlay: {
      ...source.overlay,
      title: { ...source.overlay.title },
      subtitle: { ...source.overlay.subtitle },
      cta: { ...source.overlay.cta },
      photo: target.overlay.photo,
    },
  };
}

export function withStyleOf(target: SlideDraft, source: SlideDraft): SlideDraft {
  const pick = (block: OverlayBlock, from: OverlayBlock): OverlayBlock => {
    const out = { ...block };
    for (const field of STYLE_FIELDS) {
      (out as Record<string, unknown>)[field] = from[field];
    }
    return out;
  };
  return {
    ...target,
    overlay: {
      ...target.overlay,
      style: source.overlay.style,
      title: pick(target.overlay.title, source.overlay.title),
      subtitle: pick(target.overlay.subtitle, source.overlay.subtitle),
      cta: pick(target.overlay.cta, source.overlay.cta),
    },
  };
}

// ------------------------------------------------------------------ history

interface Snapshot {
  slides: SlideDraft[];
  /** The slide the change was made on, so undoing it shows it happening. */
  active: number;
}

export interface EditorState {
  slides: SlideDraft[];
  active: number;
  past: Snapshot[];
  future: Snapshot[];
  /** The last recorded change, for folding a burst of them into one step. */
  last: { key: string; at: number } | null;
}

export type EditorAction =
  | {
      type: "edit";
      /** Changes sharing a key within a moment fold into one undo step. */
      key: string;
      at: number;
      index?: number;
      fn: (slide: SlideDraft, index: number) => SlideDraft;
    }
  | {
      type: "editAll";
      key: string;
      at: number;
      fn: (slide: SlideDraft, index: number) => SlideDraft;
    }
  | { type: "go"; index: number }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 80;
/** A pause longer than this starts a new undo step, even on the same control. */
const MERGE_MS = 900;

export function initialEditorState(slides: SlideDraft[], active: number): EditorState {
  return {
    slides,
    active: Math.min(Math.max(0, active), Math.max(0, slides.length - 1)),
    past: [],
    future: [],
    last: null,
  };
}

/**
 * Pure, so React may run it twice in development without recording a change
 * twice - the old editor pushed history from inside a state updater, which
 * development mode doubles.
 */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "edit": {
      const index = action.index ?? state.active;
      const current = state.slides[index];
      if (!current) return state;
      const next = action.fn(current, index);
      if (next === current || sameDraft(next, current)) return state;
      const slides = state.slides.slice();
      slides[index] = next;
      return { ...remember(state, action.key, action.at, index), slides };
    }
    case "editAll": {
      let changed = false;
      const slides = state.slides.map((slide, i) => {
        const next = action.fn(slide, i);
        if (next === slide || sameDraft(next, slide)) return slide;
        changed = true;
        return next;
      });
      if (!changed) return state;
      return { ...remember(state, action.key, action.at, state.active), slides };
    }
    case "go": {
      if (action.index === state.active || !state.slides[action.index]) return state;
      // Moving on closes the burst: typing on the next slide is its own step.
      return { ...state, active: action.index, last: null };
    }
    case "undo": {
      const entry = state.past[state.past.length - 1];
      if (!entry) return state;
      return {
        ...state,
        slides: entry.slides,
        active: entry.active,
        past: state.past.slice(0, -1),
        future: [{ slides: state.slides, active: entry.active }, ...state.future].slice(
          0,
          HISTORY_LIMIT,
        ),
        last: null,
      };
    }
    case "redo": {
      const entry = state.future[0];
      if (!entry) return state;
      return {
        ...state,
        slides: entry.slides,
        active: entry.active,
        future: state.future.slice(1),
        past: [...state.past, { slides: state.slides, active: entry.active }].slice(
          -HISTORY_LIMIT,
        ),
        last: null,
      };
    }
  }
}

/**
 * Records the state before a change, unless the change continues the last
 * one. A drag is one gesture however long it lasts - its key names the
 * gesture - and typing folds by pauses.
 */
function remember(
  state: EditorState,
  key: string,
  at: number,
  index: number,
): EditorState {
  const last = state.last;
  const continues =
    last !== null &&
    last.key === key &&
    (key.startsWith("gesture:") || at - last.at < MERGE_MS);
  return {
    ...state,
    past: continues
      ? state.past
      : [...state.past, { slides: state.slides, active: index }].slice(-HISTORY_LIMIT),
    future: [],
    last: { key, at },
  };
}

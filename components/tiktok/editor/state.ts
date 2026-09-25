import type { ContentLocale } from "@/lib/i18n";
import {
  PHOTO_DEFAULTS,
  defaultOverlay,
  normaliseOverlay,
  type OverlayBlock,
  type PhotoFrame,
  type SlideOverlay,
} from "@/lib/overlay";
import { slideFingerprint } from "@/lib/slide-image";
import { SLIDE_TEXT_LIMITS } from "@/lib/slide-text";
import type { CarouselRecord, CarouselSlide, MediaAsset, SlideTemplate } from "@/lib/types";

/**
 * The editor's model: the whole carousel as a draft, and its history.
 *
 * Editing a carousel is rarely one slide - it is lining seven of them up,
 * adding the CTA, dropping a weak one - so the draft covers every slide AND
 * which slides there are, in which order. Adding, duplicating, removing and
 * moving are edits like any other: undone with Ctrl+Z, written with one save.
 */

export type BlockKey = "title" | "subtitle" | "cta";
export const BLOCKS: BlockKey[] = ["title", "subtitle", "cta"];

/** What the server keeps of each block's words; the editor stops at the same place. */
export const TEXT_LIMITS: Record<BlockKey, number> = SLIDE_TEXT_LIMITS;

export interface SlideWords {
  title: string;
  subtitle: string;
  cta: string;
}

export const EMPTY_WORDS: SlideWords = { title: "", subtitle: "", cta: "" };

export interface SlideDraft {
  /** Stable for as long as the editor is open, whatever moves around it. */
  uid: string;
  /** Where the slide sits in the saved carousel; null for one not saved yet. */
  from: number | null;
  /** Which picture sat there, so a carousel changed elsewhere is caught on save. */
  fromPhoto: string | null;
  kind: CarouselSlide["kind"];
  /** Carries the carousel's Plenova mention. */
  mention: boolean;
  /** Normalised on the way in, so every field exists and compares cleanly. */
  overlay: SlideOverlay;
  text: Partial<Record<ContentLocale, SlideWords>>;
  mediaId: string | null;
  imageUrl: string | null;
  imagePrompt: string;
}

let uidSeq = 0;
/** A fresh key for a slide the editor did not load. */
export function nextUid(): string {
  uidSeq += 1;
  return `slide-${uidSeq}`;
}

function wordsFor(
  languages: ContentLocale[],
  pick: (language: ContentLocale) => Partial<SlideWords> | undefined,
): SlideDraft["text"] {
  const text: SlideDraft["text"] = {};
  for (const language of languages) {
    const words = pick(language);
    text[language] = {
      title: words?.title ?? "",
      subtitle: words?.subtitle ?? "",
      cta: words?.cta ?? "",
    };
  }
  return text;
}

/** One stored slide as a draft, at its stored position. */
export function draftFrom(
  slide: CarouselSlide,
  index: number,
  languages: ContentLocale[],
  uid: string = nextUid(),
): SlideDraft {
  return {
    uid,
    from: index,
    fromPhoto: slideFingerprint(slide),
    kind: slide.kind,
    mention: Boolean(slide.hasPlenovaMention),
    overlay: slide.overlay ? normaliseOverlay(slide.overlay) : defaultOverlay(),
    text: wordsFor(languages, (l) => slide.text[l]),
    mediaId: slide.mediaId,
    imageUrl: slide.imageUrl,
    imagePrompt: slide.imagePrompt ?? "",
  };
}

export function draftsFrom(carousel: CarouselRecord): SlideDraft[] {
  return carousel.slides.map((slide, i) => draftFrom(slide, i, carousel.languages));
}

/**
 * A new slide showing a library picture, laid out like the slide it follows
 * so the carousel keeps one look; no words yet, in any language.
 */
export function draftFromAsset(
  asset: Pick<MediaAsset, "id" | "url" | "prompt">,
  layout: SlideOverlay,
  languages: ContentLocale[],
): SlideDraft {
  return {
    uid: nextUid(),
    from: null,
    fromPhoto: null,
    kind: "content",
    mention: false,
    overlay: { ...structuredClone(layout), photo: { ...PHOTO_DEFAULTS } },
    text: wordsFor(languages, () => undefined),
    mediaId: asset.id,
    imageUrl: asset.url,
    imagePrompt: asset.prompt ?? "",
  };
}

/**
 * A saved slide dropped into this carousel: its picture, its layout, and its
 * words in each of this carousel's languages - empty where it was never
 * written in one, which the editor flags.
 */
export function draftFromTemplate(
  template: SlideTemplate,
  languages: ContentLocale[],
): SlideDraft {
  return {
    uid: nextUid(),
    from: null,
    fromPhoto: null,
    kind: template.kind === "cta" ? "cta" : "content",
    mention: template.kind === "cta",
    overlay: normaliseOverlay(structuredClone(template.overlay)),
    text: wordsFor(languages, (l) => template.text[l]),
    mediaId: template.mediaId,
    imageUrl: template.imageUrl,
    imagePrompt: "",
  };
}

/** The same slide again, right after it - a starting point for a variant. */
export function duplicateDraft(slide: SlideDraft): SlideDraft {
  return {
    ...structuredClone(slide),
    uid: nextUid(),
    from: null,
    fromPhoto: null,
    // One slide carries the mention; a copy is a copy.
    mention: false,
    kind: slide.kind === "hook" ? "content" : slide.kind,
  };
}

export function wordsOf(slide: SlideDraft | undefined, lang: ContentLocale): SlideWords {
  return slide?.text[lang] ?? EMPTY_WORDS;
}

/**
 * The other languages a block is written in, while it is empty in this one.
 *
 * That is the only missing text worth pointing at: a translation still to
 * write. A block empty in every language is a choice - a slide may carry only
 * its photo, or only a CTA - and the editor leaves it alone.
 */
export function writtenElsewhere(
  slide: SlideDraft | undefined,
  lang: ContentLocale,
  key: BlockKey,
): ContentLocale[] {
  if (!slide || wordsOf(slide, lang)[key].trim()) return [];
  return (Object.keys(slide.text) as ContentLocale[]).filter(
    (l) => l !== lang && Boolean(slide.text[l]?.[key].trim()),
  );
}

/** The blocks of a slide still to translate into this language. */
export function untranslated(slide: SlideDraft | undefined, lang: ContentLocale): BlockKey[] {
  return BLOCKS.filter((key) => writtenElsewhere(slide, lang, key).length > 0);
}

/** A block taken off the slide: its words go in every language, its place stays. */
export function withoutBlock(slide: SlideDraft, key: BlockKey): SlideDraft {
  const text: SlideDraft["text"] = {};
  for (const [l, words] of Object.entries(slide.text) as [ContentLocale, SlideWords | undefined][]) {
    text[l] = { ...(words ?? EMPTY_WORDS), [key]: "" };
  }
  return { ...slide, text };
}

export function sameDraft(a: SlideDraft | undefined, b: SlideDraft | undefined): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Same words, layout and picture - what "unchanged" means for saving. */
export function sameContent(a: SlideDraft | undefined, b: SlideDraft | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const content = (s: SlideDraft) =>
    JSON.stringify([s.overlay, s.text, s.mediaId, s.imageUrl, s.imagePrompt]);
  return content(a) === content(b);
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
  | { type: "insert"; key: string; at: number; index: number; slide: SlideDraft }
  | { type: "remove"; key: string; at: number; index: number }
  /** A new order, as the list of slide keys. */
  | { type: "order"; key: string; at: number; uids: string[] }
  | { type: "go"; index: number }
  | { type: "undo" }
  | { type: "redo" }
  /**
   * After a save: every slide's new stored position, by key. Applied to the
   * history too, so undoing past a save still knows which slides exist.
   */
  | { type: "rebase"; origin: Map<string, { from: number; fromPhoto: string }> };

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
 * twice - the first editor pushed history from inside a state updater, which
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
    case "insert": {
      const index = Math.min(Math.max(0, action.index), state.slides.length);
      const slides = state.slides.slice();
      slides.splice(index, 0, action.slide);
      return { ...remember(state, action.key, action.at, state.active), slides, active: index };
    }
    case "remove": {
      // A carousel keeps at least one slide.
      if (state.slides.length <= 1 || !state.slides[action.index]) return state;
      const slides = state.slides.slice();
      slides.splice(action.index, 1);
      return {
        ...remember(state, action.key, action.at, action.index),
        slides,
        active: Math.min(action.index, slides.length - 1),
      };
    }
    case "order": {
      const byUid = new Map(state.slides.map((s) => [s.uid, s]));
      if (action.uids.length !== state.slides.length) return state;
      const slides = action.uids.map((uid) => byUid.get(uid));
      if (slides.some((s) => !s)) return state;
      const ordered = slides as SlideDraft[];
      if (ordered.every((s, i) => s === state.slides[i])) return state;
      // The slide on screen stays on screen, wherever it went.
      const onScreen = state.slides[state.active]?.uid;
      return {
        ...remember(state, action.key, action.at, state.active),
        slides: ordered,
        active: Math.max(0, ordered.findIndex((s) => s.uid === onScreen)),
      };
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
        active: Math.min(entry.active, entry.slides.length - 1),
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
        active: Math.min(entry.active, entry.slides.length - 1),
        future: state.future.slice(1),
        past: [...state.past, { slides: state.slides, active: entry.active }].slice(
          -HISTORY_LIMIT,
        ),
        last: null,
      };
    }
    case "rebase": {
      // A slide the save knows is at its new position; one it does not know -
      // removed, or restored by an undo after the save - is new again.
      const remap = (slides: SlideDraft[]) =>
        slides.map((s) => {
          const origin = action.origin.get(s.uid);
          const from = origin?.from ?? null;
          const fromPhoto = origin?.fromPhoto ?? null;
          return s.from === from && s.fromPhoto === fromPhoto ? s : { ...s, from, fromPhoto };
        });
      return {
        ...state,
        slides: remap(state.slides),
        past: state.past.map((e) => ({ ...e, slides: remap(e.slides) })),
        future: state.future.map((e) => ({ ...e, slides: remap(e.slides) })),
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

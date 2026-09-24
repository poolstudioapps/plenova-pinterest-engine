import "server-only";
import { PLANTS, getPlant } from "@/lib/data/plants";
import {
  matchPlantSlug,
  plantName as localizedPlantName,
} from "@/lib/data/localize";
import { getVisualStyle } from "@/lib/data/visual-styles";
import { AppError, badRequest, notFound } from "@/lib/errors";
import {
  generateCarouselConcept,
  generatePinImage,
  reinterpretImage,
} from "@/lib/gemini";
import { DEFAULT_CONTENT_LOCALE, type ContentLocale } from "@/lib/i18n";
import { extensionFor, hostImageAt } from "@/lib/images";
import { leastUsed, mediaPath, shelfOf, varietySlug } from "@/lib/media";
import { findReference, isPexelsConfigured } from "@/lib/pexels";
import { config } from "@/lib/config";
import { signLabel } from "@/lib/crypto";
import { getStore } from "@/lib/store";
import { truncate } from "@/lib/utils";
import { getPublishStatus, publishCarousel } from "@/lib/tiktok";
import {
  defaultOverlay,
  type OverlayStyle,
  type SlideOverlay,
} from "@/lib/overlay";
import {
  MAX_HASHTAGS,
  REQUIRED_HASHTAGS,
  type MultiText,
} from "@/lib/prompts-carousel";
import type {
  CarouselPost,
  CarouselRecord,
  CarouselSlide,
  MediaAsset,
  SlideText,
} from "@/lib/types";

/**
 * Carousel orchestration: theme in, publishable carousel out.
 *
 * Two things shape the design.
 *
 * A carousel starts from a THEME. Gemini designs the slides - overlay copy and
 * a photography brief each - and only then are the images produced. Building
 * one out of whatever images already existed produced a slideshow with no
 * argument running through it.
 *
 * And it is written in every language at once. The images are shared across
 * languages; only the words over them differ. One production run therefore
 * feeds every connected account, each posting in its own language.
 */

function carouselId(): string {
  return `car_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** TikTok's carousel format. */
const SLIDE_ASPECT = "4:5";

/**
 * Where slide images come from.
 *
 *  - `generate` : text-to-image only. Fastest, but the polish reads as AI.
 *  - `photo`    : a real photograph is used as a reference and reinterpreted
 *                 into an original image. Slower, markedly more believable,
 *                 and nothing from the reference is republished.
 *  - `library`  : reuse images already generated for this plant, producing
 *                 only the slides that have nothing to reuse.
 */
export type ImageSource = "generate" | "photo" | "library";

export interface GenerateCarouselInput {
  theme: string;
  /** Languages to write. The first is the primary one. */
  languages?: ContentLocale[];
  imageSource?: ImageSource;
  plantSlug?: string;
  variety?: string;
  /** Starting look for every slide. Each one can be adjusted afterwards. */
  overlayStyle?: OverlayStyle;
}

/**
 * Creates the record immediately, before any model call.
 *
 * Generation takes minutes, which is far longer than a browser tab can be
 * relied on to stay open. Persisting a placeholder first means the work is
 * owned by the server: navigating away, or closing the tab, no longer loses
 * it, and the carousel list can show it in progress.
 */
export async function startCarousel(
  input: GenerateCarouselInput,
): Promise<CarouselRecord> {
  const theme = input.theme.trim();
  if (theme.length < 3) throw badRequest("Décris le thème du carrousel.");

  const languages =
    input.languages && input.languages.length > 0
      ? Array.from(new Set(input.languages))
      : [DEFAULT_CONTENT_LOCALE];

  const plant = input.plantSlug ? getPlant(input.plantSlug) : undefined;
  if (input.plantSlug && !plant) {
    throw badRequest(`Plante inconnue : ${input.plantSlug}`);
  }

  const now = new Date().toISOString();
  const record: CarouselRecord = {
    id: carouselId(),
    languages,
    theme,
    caption: {},
    hashtags: {},
    slides: [],
    coverIndex: 1,
    plantSlug: plant?.slug ?? null,
    plantName: plant ? localizedPlantName(plant, "en") : null,
    status: "generating",
    posts: [],
    error: null,
    progress: null,
    createdAt: now,
    updatedAt: now,
  };

  await getStore().saveCarousel(record);
  return record;
}

/**
 * Does the actual work, updating the record as it goes.
 *
 * Runs detached from the request that started it, so every failure has to be
 * written to the record rather than thrown at a caller that is no longer
 * listening.
 */
export async function runCarouselGeneration(
  id: string,
  input: GenerateCarouselInput,
): Promise<void> {
  try {
    await generateCarousel(id, input);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "La génération a échoué. Réessaie.";
    try {
      const store = getStore();
      const carousel = await store.getCarousel(id);
      if (!carousel) return;
      await store.saveCarousel({
        ...carousel,
        status: "failed",
        error: reason,
        updatedAt: new Date().toISOString(),
      });
    } catch (writeErr) {
      // Nothing is listening for this rejection, and an unhandled one here
      // would leave the record on "generating" with no trace at all. The
      // staleness rule in normaliseCarousel is what finally frees it.
      console.error(
        `[carousel] ${id} failed (${reason}) and the failure could not be recorded:`,
        writeErr,
      );
    }
  }
}

async function generateCarousel(
  id: string,
  input: GenerateCarouselInput,
): Promise<CarouselRecord> {
  const theme = input.theme.trim();

  const languages =
    input.languages && input.languages.length > 0
      ? Array.from(new Set(input.languages))
      : [DEFAULT_CONTENT_LOCALE];

  const store = getStore();
  const plant = input.plantSlug ? getPlant(input.plantSlug) : undefined;
  if (input.plantSlug && !plant) {
    throw badRequest(`Plante inconnue : ${input.plantSlug}`);
  }

  // Past themes go back into the prompt so a new carousel does not re-tread one.
  const existing = await store.listCarousels();
  const concept = await generateCarouselConcept({
    theme,
    languages,
    plantName: plant ? localizedPlantName(plant, "en") : undefined,
    existingThemes: existing.map((c) => c.theme).filter(Boolean),
  });

  const vSlug = varietySlug(input.variety);
  const source: ImageSource = input.imageSource ?? "photo";

  // Reusable stock for the library source: images already paid for on this
  // plant, so a carousel can cost nothing when they exist.
  const reusable =
    source === "library" && plant
      ? await store.listMedia({ plantSlug: plant.slug, limit: 60 })
      : [];
  let reuseCursor = 0;

  /*
   * The operator's own shelves.
   *
   * CTA images were prepared by hand for the Plenova slide and are used
   * whatever the image source: nothing the model generates will show the app
   * the way the operator's own shots do. Hook/Outro images open and close a
   * carousel built from the library - generic green shots, including every
   * image filed under a species nobody could name.
   *
   * Each is taken out of its pool once used, so the cover and the closing
   * slide never end up the same picture.
   */
  const shelves = await loadShelves();

  // Produced in order so a failure names the slide it belongs to, rather than
  // surfacing as one opaque batch error.
  const slides: CarouselSlide[] = [];
  for (const [index, draft] of concept.slides.entries()) {
    // midCtaIndex is 1-based, as the model was asked for. Decided before the
    // image, because which image a slide gets depends on what it carries.
    const isMentionSlide = index + 1 === concept.midCtaIndex;
    const isBookend = draft.kind === "hook" || draft.kind === "cta";

    const recycled = isMentionSlide
      ? takeLeastUsed(shelves.cta)
      : isBookend && source === "library"
        ? (takeLeastUsed(shelves.hook) ?? reusable[reuseCursor++])
        : source === "library"
          ? reusable[reuseCursor++]
          : undefined;
    const asset =
      recycled ??
      (await produceSlideImage({
        id: `${id}_${index}`,
        imagePrompt: draft.imagePrompt,
        photoQuery: draft.photoQuery,
        source,
        // The slide names its own species, which matters on a listicle where
        // every slide shows a different one. Falls back to the carousel's
        // plant, then to an unfiled bucket.
        plantSlug:
          (draft.plantTag ? matchPlantSlug(draft.plantTag) : null) ??
          plant?.slug ??
          "unfiled",
        plantName: draft.plantTag || (plant ? localizedPlantName(plant, "en") : theme),
        variety: input.variety ?? null,
        varietySlug: vSlug,
        theme,
      }));

    if (recycled) await store.markMediaUsed(recycled.id);

    const inProgress = await store.getCarousel(id);
    if (inProgress) {
      await store.saveCarousel({
        ...inProgress,
        progress: { done: index + 1, total: concept.slides.length },
        updatedAt: new Date().toISOString(),
      });
    }


    /**
     * A language the model skipped falls back to the first one it did write.
     *
     * The schema marks every language required, so this should not happen -
     * but when it did, that language's slide was composed with no text at all
     * and the carousel published a bare photograph. Wrong-language words are
     * visibly wrong and can be fixed in the editor; missing words are silent.
     */
    const fallback = (field: MultiText): string => {
      for (const lang of languages) {
        const value = field[lang]?.trim();
        if (value) return value;
      }
      return "";
    };

    const text: CarouselSlide["text"] = {};
    for (const lang of languages) {
      const title = draft.title[lang]?.trim() || fallback(draft.title);
      if (!title) continue;
      // The mention is kept only on the slide the model chose for it, so a
      // model that filled the field everywhere cannot turn the carousel into
      // an advert.
      const mention = isMentionSlide
        ? (draft.cta?.[lang]?.trim() || fallback(draft.cta ?? {}))
        : "";
      text[lang] = {
        title,
        // The hook deliberately has no subtitle, so an empty one is not a gap.
        subtitle: draft.subtitle[lang]?.trim() ?? "",
        ...(mention ? { cta: mention } : {}),
      };
    }

    slides.push({
      kind: draft.kind,
      hasPlenovaMention: isMentionSlide,
      text,
      imagePrompt: draft.imagePrompt,
      photoQuery: draft.photoQuery,
      overlay: startingOverlay(input.overlayStyle ?? "stroke", text),
      mediaId: asset.id,
      imageUrl: asset.url,
      composed: {},
    });
  }

  // Hashtags ride at the end of the caption, which is how TikTok reads them.
  const caption: CarouselRecord["caption"] = {};
  const hashtags: CarouselRecord["hashtags"] = {};
  for (const lang of languages) {
    const tags = normaliseHashtags(concept.hashtags[lang]);
    hashtags[lang] = tags;
    caption[lang] = [
      concept.caption[lang] ?? "",
      tags.map((h) => `#${h}`).join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const started = await store.getCarousel(id);
  const record: CarouselRecord = {
    id,
    languages,
    theme,
    caption,
    hashtags,
    slides,
    coverIndex: 1,

    plantSlug: plant?.slug ?? null,
    plantName: plant ? localizedPlantName(plant, "en") : null,

    status: "draft",
    posts: [],
    error: null,
    progress: null,

    createdAt: started?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Generating takes minutes, and this last write rebuilds the whole record.
  // If the operator deleted the carousel meanwhile, writing it now would put
  // it straight back - which is what made a deletion need several attempts.
  const stillWanted = await store.getCarousel(id);
  if (!stillWanted) return record;

  await store.saveCarousel(record);
  return record;
}

/** Produces one slide image and files it in the media library. */
async function produceSlideImage(input: {
  id: string;
  imagePrompt: string;
  photoQuery: string;
  source: ImageSource;
  plantSlug: string;
  plantName: string;
  variety: string | null;
  varietySlug: string | null;
  theme: string;
}): Promise<MediaAsset> {
  // Slides carry their text as an overlay, so the image itself must stay clean.
  const style = getVisualStyle("editorial-photo")!;

  let image;
  let referencedFrom: string | null = null;

  if (input.source === "photo" && isPexelsConfigured()) {
    const plant = getPlant(input.plantSlug);
    const species = plant
      ? {
          scientificName: plant.scientificName ?? plant.name,
          commonName: plant.name,
          ...(plant.visualTraits ? { visualTraits: plant.visualTraits } : {}),
        }
      : null;

    /*
     * Most specific first, and never a generic last resort.
     *
     * The scene the model described, then the species by its botanical name,
     * then by its English common name. The old final fallback was
     * "houseplant interior", which returns any plant at all - and a reference
     * showing the wrong species anchors Gemini on the wrong species. With no
     * specific match, the slide is generated without a reference, which is
     * less photographic but never the wrong plant.
     */
    const reference = await findReference(
      [
        input.photoQuery,
        species?.scientificName ?? "",
        species ? `${species.commonName} plant` : `${input.plantName} plant`,
      ].filter(Boolean),
    );
    if (reference) {
      // Only Gemini's output is ever stored or published. The Pexels photo is
      // held in memory for this one call and never leaves the server.
      image = await reinterpretImage(
        { data: reference.data, mimeType: "image/jpeg" },
        input.imagePrompt,
        SLIDE_ASPECT,
        species,
      );
      referencedFrom = reference.photo.photographer;
    }
  }

  // Reached when the source is `generate`, when Pexels is unconfigured, or when
  // nothing matched - a missing reference must never fail the carousel, only
  // make that one slide glossier.
  image ??= await generatePinImage(input.imagePrompt, style);

  const mediaId = `med_${input.id}`;
  const path = mediaPath(
    { plantSlug: input.plantSlug, varietySlug: input.varietySlug, id: mediaId },
    extensionFor(image.mimeType),
  );
  const hosted = await hostImageAt(path, image.data, image.mimeType);

  const now = new Date().toISOString();
  const asset: MediaAsset = {
    id: mediaId,
    plantSlug: input.plantSlug,
    plantName: input.plantName,
    variety: input.variety,
    varietySlug: input.varietySlug,
    url: hosted.url,
    mimeType: image.mimeType,
    aspectRatio: SLIDE_ASPECT,
    prompt: input.imagePrompt,
    visualStyle: "editorial-photo",
    angleSlug: null,
    source: "carousel",
    sourceId: input.id,
    referencePhotographer: referencedFrom,
    tags: input.theme
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 6),
    usedCount: 1,
    lastUsedAt: now,
    createdAt: now,
  };

  await getStore().saveMedia(asset);
  return asset;
}

/**
 * Records a slide composed in the operator's browser, for one language.
 *
 * The bare photograph stays untouched in the media library; only the carousel
 * points at the composite, so the same image can back another carousel - or
 * another language - with different words over it.
 */
/**
 * Stores one composed slide's bytes, and nothing else.
 *
 * Deliberately writes no record. The state lives in a single JSON document, so
 * every record write is a read-modify-write of the whole thing; doing one per
 * slide per language meant fourteen of them for a seven-slide carousel, and a
 * read that lagged even briefly behind the previous write silently dropped a
 * slide. The bytes go to their own object here, and one call records them all
 * afterwards.
 */
export async function uploadComposedSlide(
  id: string,
  index: number,
  language: ContentLocale,
  data: Buffer,
  mimeType: string,
): Promise<{ url: string }> {
  const carousel = await getStore().getCarousel(id);
  if (!carousel) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);
  if (!carousel.slides[index]) {
    throw badRequest(`La slide ${index} n'existe pas dans ce carrousel.`);
  }

  const hosted = await hostImageAt(
    `carousels/${id}/${language}/slide-${index + 1}.${extensionFor(mimeType)}`,
    data,
    mimeType,
  );
  return { url: hosted.url };
}

/**
 * Records every composed slide for one language, in one write.
 *
 * The composite - the photograph with the text burned into it - is what gets
 * published, and it is kept on the carousel as `slide.composed[lang]`. It is
 * deliberately NOT filed in the media library: the library is a library of
 * PLANTS, and an image carrying "Top 5 des pothos rares" across it is not
 * reusable for anything. Only the bare photograph belongs there, and
 * `recordSlideImage` already put it there.
 */
export async function recordComposedSlides(
  id: string,
  language: ContentLocale,
  entries: { index: number; url: string }[],
  mimeType = "image/jpeg",
): Promise<CarouselRecord> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);

  const byIndex = new Map(entries.map((e) => [e.index, e.url]));
  const slides = carousel.slides.map((slide, i) => {
    const url = byIndex.get(i);
    return url
      ? { ...slide, composed: { ...slide.composed, [language]: url } }
      : slide;
  });


  const updated: CarouselRecord = {
    ...carousel,
    slides,
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);
  return updated;
}

/**
 * The layout a slide starts with.
 *
 * Everything here is editable afterwards, so this only has to be a good first
 * guess - but a good first guess is most of the value. A fixed size makes long
 * titles wrap into an unreadable block, and the longest translation is the one
 * that has to fit, since all languages share the layout.
 */
function startingOverlay(
  style: OverlayStyle,
  text: Partial<Record<ContentLocale, SlideText>>,
): SlideOverlay {
  const overlay = defaultOverlay(style);
  const longest = Math.max(
    0,
    ...Object.values(text).map((t) => t?.title.length ?? 0),
  );

  overlay.title.fontSize =
    longest <= 22 ? 104 : longest <= 34 ? 88 : longest <= 50 ? 74 : 62;

  /*
   * TikTok's text sits smaller in the frame than a poster headline, and a
   * background box makes the same size read heavier still. Pills start at
   * three quarters of the outlined sizes.
   */
  const scale = style === "pillWhite" || style === "pillBlack" ? 0.75 : 1;
  overlay.title.fontSize = Math.round(overlay.title.fontSize * scale);

  const longestSub = Math.max(
    0,
    ...Object.values(text).map((t) => t?.subtitle.length ?? 0),
  );
  overlay.subtitle.fontSize = Math.round(
    (longestSub <= 60 ? 52 : longestSub <= 95 ? 44 : 38) * scale,
  );

  return overlay;
}

/**
 * Saves one slide's words and layout, from the editor.
 *
 * Any composite that the change invalidates is dropped. Text edits only
 * invalidate the language they were made in; a layout change invalidates every
 * language, because the layout is shared. Leaving a stale composite in place
 * would publish the old wording, which is the worst of the three outcomes.
 */
export async function updateSlide(
  id: string,
  index: number,
  patch: {
    text?: Partial<Record<ContentLocale, SlideText>>;
    overlay?: SlideOverlay;
  },
): Promise<CarouselRecord> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);

  const slide = carousel.slides[index];
  if (!slide) throw badRequest(`Ce carrousel n'a pas de slide ${index + 1}.`);

  const text = { ...slide.text };
  const stale = new Set<ContentLocale>();

  for (const [language, value] of Object.entries(patch.text ?? {})) {
    const locale = language as ContentLocale;
    const before = slide.text[locale];
    if (
      before?.title === value.title &&
      before?.subtitle === value.subtitle &&
      (before?.cta ?? "") === (value.cta ?? "")
    ) {
      continue;
    }
    text[locale] = value;
    stale.add(locale);
  }

  const overlay = patch.overlay ?? slide.overlay;
  if (patch.overlay && JSON.stringify(patch.overlay) !== JSON.stringify(slide.overlay)) {
    for (const language of carousel.languages) stale.add(language);
  }

  const composed = { ...slide.composed };
  for (const language of stale) delete composed[language];

  const slides = [...carousel.slides];
  slides[index] = { ...slide, text, overlay, composed };

  const updated: CarouselRecord = {
    ...carousel,
    slides,
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);
  return updated;
}

/**
 * Asks TikTok again about every post still waiting, and records the answer.
 *
 * Publishing is asynchronous and can take minutes: TikTok acknowledges, then
 * pulls every slide, then decides. The check made during the run is bounded by
 * how long a request may stay open, so a post that is still being processed is
 * recorded as waiting rather than guessed at - and this is how that wait is
 * resolved without publishing anything twice.
 */
export async function refreshPublishStatus(
  id: string,
): Promise<CarouselRecord> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);

  const posts = await Promise.all(
    carousel.posts.map(async (post) => {
      if (post.settled !== "pending" || !post.publishId) return post;
      try {
        const { status, failReason } = await getPublishStatus(
          post.openId,
          post.publishId,
        );
        const done =
          post.postMode === "MEDIA_UPLOAD"
            ? "SEND_TO_USER_INBOX"
            : "PUBLISH_COMPLETE";
        if (status === "FAILED") {
          return {
            ...post,
            settled: "failed" as const,
            publishedAt: null,
            error: `TikTok a refusé la publication : ${failReason ?? "raison inconnue"}`,
          };
        }
        if (status === done || status === "PUBLISH_COMPLETE") {
          return {
            ...post,
            settled: "published" as const,
            publishedAt: post.publishedAt ?? new Date().toISOString(),
            error: null,
          };
        }
        return post;
      } catch {
        // Still inconclusive. Leave it waiting rather than decide for TikTok.
        return post;
      }
    }),
  );

  const updated: CarouselRecord = {
    ...carousel,
    posts,
    status: posts.some((p) => p.settled === "published")
      ? "published"
      : posts.some((p) => p.settled === "pending")
        ? "publishing"
        : "failed",
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);
  return updated;
}

/** The images to publish for one language, composites where they exist. */
/**
 * The image URLs handed to TikTok, for one language.
 *
 * Always on our own domain, never the Blob hostname: TikTok pulls these itself
 * and rejects any domain not verified in its developer portal. The Blob
 * hostname belongs to Vercel and cannot be verified, so it is relayed.
 *
 * Composites only, never the bare photograph. Two reasons, and either alone
 * would be enough: a slide without its text burned in is not the post anyone
 * meant to publish, and the bare image comes out of the model at 2K, which is
 * over TikTok's limit and fails the whole carousel with
 * picture_size_check_failed. The composite is drawn into a 1080x1350 canvas,
 * so it is within the limit by construction.
 */
export function slideUrlsFor(
  carousel: CarouselRecord,
  language: ContentLocale,
): string[] {
  return carousel.slides
    .map((slide, index) => {
      if (!slide.composed[language]) return null;
      const label = `${carousel.id}:${index}:${language}`;
      return `${config.app.url}/api/pull/${carousel.id}/${index}/${language}/${signLabel(label)}.jpg`;
    })
    .filter((u): u is string => u !== null);
}

export interface PublishOptions {
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  privacyLevel?: string;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
  /** Off unless the operator turns it on, which is what TikTok requires. */
  allowComment?: boolean;
  /** Declares the slides as model-generated. True unless told otherwise. */
  isAigc?: boolean;
  /**
   * Replaces the title for every account. Empty means each language keeps the
   * one written for it, which is the point of writing several.
   */
  title?: string;
}

export interface MultipostOutcome {
  carousel: CarouselRecord;
  posts: CarouselPost[];
  publishedCount: number;
  failedCount: number;
}

/**
 * Posts one carousel to several accounts, each in its own language.
 *
 * Accounts are handled independently on purpose: one failing account records
 * its error and the rest still go out. Failing the whole run because a single
 * token expired would be the wrong trade when six other accounts are fine.
 */
export async function publishToAccounts(
  id: string,
  openIds: string[],
  options: PublishOptions,
): Promise<MultipostOutcome> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);
  if (openIds.length === 0) throw badRequest("Choisis au moins un compte.");

  await store.saveCarousel({
    ...carousel,
    status: "publishing",
    updatedAt: new Date().toISOString(),
  });

  // Results for accounts this run does not touch are carried through
  // untouched, so a partial record never loses the earlier ones.
  const untouched = carousel.posts.filter((p) => !openIds.includes(p.openId));
  const posts: CarouselPost[] = [];
  /** Accounts skipped because they already carry a post from a previous run. */
  const alreadyDone = new Set<string>();

  /**
   * Written after every account, not once at the end.
   *
   * Seven accounts, each with a bounded confirmation wait, can run past the
   * function's time limit. Saving only at the end would lose the publish ids
   * already obtained, and the next attempt - seeing no record - would post to
   * those accounts a second time.
   */
  const persist = async (status: CarouselRecord["status"]) => {
    await store.saveCarousel({
      ...carousel,
      posts: [...untouched, ...posts],
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  for (const openId of openIds) {
    const account = await store.getTikTokAccount(openId);
    if (!account) {
      posts.push(
        failedPost(openId, "", DEFAULT_CONTENT_LOCALE, options, "Ce compte n'est pas connecté. Reconnecte-le dans Compte TikTok."),
      );
      await persist("publishing");
      continue;
    }

    // Already posted to this account? Never create a second post for it.
    const previous = carousel.posts.find(
      (p) => p.openId === openId && p.publishId && p.settled !== "failed",
    );
    if (previous) {
      // Carried through so the screen still shows its state, but recorded as
      // already done: counting it again reported a success this run did not
      // achieve.
      posts.push(previous);
      alreadyDone.add(openId);
      continue;
    }


    const language = account.language;
    const caption = carousel.caption[language];
    const urls = slideUrlsFor(carousel, language);

    if (!caption || urls.length === 0) {
      posts.push(
        failedPost(
          openId,
          account.username,
          language,
          options,
          `Ce carrousel n'a rien de rédigé en ${language}.`,
        ),
      );
      await persist("publishing");
      continue;
    }

    // Every slide, or none. A partial run would post a shorter carousel than
    // the one on screen, silently dropping whatever had not been rendered.
    if (urls.length !== carousel.slides.length) {
      posts.push(
        failedPost(
          openId,
          account.username,
          language,
          options,
          `Seules ${urls.length} slides sur ${carousel.slides.length} ont leur texte incrusté en ${language}. Ouvre le carrousel, attends la fin de l'incrustation, puis publie.`,
        ),
      );
      await persist("publishing");
      continue;
    }

    try {
      const { publishId } = await publishCarousel({
        openId,
        // TikTok takes the first line as the title.
        title: truncate(
          options.title?.trim() ||
            carousel.slides[0]?.text[language]?.title ||
            carousel.theme,
          90,
        ),
        description: caption,
        imageUrls: urls,
        coverIndex: carousel.coverIndex,
        postMode: options.postMode,
        privacyLevel: options.privacyLevel,
        brandContentToggle: options.brandContentToggle,
        brandOrganicToggle: options.brandOrganicToggle,
        allowComment: options.allowComment,
        isAigc: options.isAigc,
      });

      // A publish id only means TikTok accepted the request. It then fetches
      // every slide and can still fail - a rejected image, a blocked domain.
      // Reporting success on the id alone would be reporting a lie.
      const outcome = await confirmPublish(openId, publishId, options.postMode);

      posts.push({
        openId,
        username: account.username,
        language,
        postMode: options.postMode,
        privacyLevel: options.privacyLevel ?? null,
        brandContentToggle: Boolean(options.brandContentToggle),
        brandOrganicToggle: Boolean(options.brandOrganicToggle),
        // The id is kept whatever happened: it is how a post is recognised as
        // already made, and how its state can be asked for again later.
        publishId,
        // Only a post TikTok says is done carries a published time.
        publishedAt:
          outcome.settled === "published" ? new Date().toISOString() : null,
        settled: outcome.settled,
        error:
          outcome.settled === "failed"
            ? `TikTok a refusé la publication : ${outcome.reason ?? "raison inconnue"}`
            : null,
      });
    } catch (err) {
      posts.push(
        failedPost(
          openId,
          account.username,
          language,
          options,
          reasonFrom(err),
        ),
      );
    }

    await persist("publishing");
  }

  const allPosts = [...untouched, ...posts];
  // Pending is not published. A run that only got acknowledgements reports
  // nothing published, which is the honest answer.
  const publishedCount = posts.filter(
    (p) => p.settled === "published" && !alreadyDone.has(p.openId),
  ).length;

  const updated: CarouselRecord = {
    ...carousel,
    posts: allPosts,
    // Acknowledged is not published. While anything is still waiting on
    // TikTok the carousel stays "publishing", because saying "published" and
    // then having nothing appear is the worst of the three answers.
    status: allPosts.some((p) => p.settled === "published")
      ? "published"
      : allPosts.some((p) => p.settled === "pending")
        ? "publishing"
        : "failed",
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);

  return {
    carousel: updated,
    posts,
    publishedCount,
    failedCount: posts.filter(
      (p) => p.settled === "failed" && !alreadyDone.has(p.openId),
    ).length,
  };
}

/**
 * The reason an account failed, with TikTok's own words attached.
 *
 * The client error carries a generic sentence and puts the upstream message in
 * `details.hint`, which was being dropped - so every failure read "TikTok API
 * error" and named nothing that could be acted on.
 */
function reasonFrom(err: unknown): string {
  const base = err instanceof Error ? err.message : "La publication a échoué.";
  const hint =
    err instanceof AppError && err.details && typeof err.details === "object"
      ? (err.details as { hint?: unknown }).hint
      : undefined;
  return typeof hint === "string" && hint.trim() ? `${base} ${hint}` : base;
}

function failedPost(
  openId: string,
  username: string,
  language: ContentLocale,
  options: PublishOptions,
  error: string,
): CarouselPost {
  return {
    openId,
    username,
    language,
    postMode: options.postMode,
    privacyLevel: options.privacyLevel ?? null,
    brandContentToggle: Boolean(options.brandContentToggle),
    brandOrganicToggle: Boolean(options.brandOrganicToggle),
    publishId: null,
    publishedAt: null,
    settled: "failed",
    error,
  };
}


/**
 * Waits briefly for TikTok to confirm a post.
 *
 * Publishing is asynchronous: the init call returns an id, then TikTok pulls
 * every slide and can still reject the whole thing minutes later. So the
 * answer has three states, not two. Only a terminal success is "published";
 * still-processing is "pending", and stays pending rather than being recorded
 * as a success nothing will ever re-check.
 */
type PublishOutcome = {
  settled: "published" | "failed" | "pending";
  reason: string | null;
};

async function confirmPublish(
  openId: string,
  publishId: string,
  postMode: PublishOptions["postMode"],
): Promise<PublishOutcome> {
  // A draft's terminal success is landing in the inbox, not being published.
  const done = postMode === "MEDIA_UPLOAD" ? "SEND_TO_USER_INBOX" : "PUBLISH_COMPLETE";

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const { status, failReason } = await getPublishStatus(openId, publishId);
      if (status === "FAILED") return { settled: "failed", reason: failReason };
      if (status === done || status === "PUBLISH_COMPLETE") {
        return { settled: "published", reason: null };
      }
    } catch (err) {
      const code =
        err instanceof AppError && err.details && typeof err.details === "object"
          ? (err.details as { code?: unknown }).code
          : undefined;
      // TikTok having no record of this publish id IS evidence of failure.
      if (
        code === "invalid_publish_id" ||
        code === "token_not_authorized_for_specified_publish_id"
      ) {
        return { settled: "failed", reason: String(code) };
      }
      // Anything else is inconclusive: keep trying rather than deciding.
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return { settled: "pending", reason: null };
}


/**
 * The hashtag rule, applied to whatever the model returned.
 *
 * The prompt asks for at most five with `planttok` among them; this is what
 * makes it true. A model asked for "3 to 5" will sometimes send nine, and the
 * required tag is the one most likely to be dropped when it is competing for
 * room - so the cap is applied first and `planttok` is then guaranteed a slot.
 *
 * Order is meaning here: the model is told to put the most relevant first, so
 * trimming takes from the tail.
 */
export function normaliseHashtags(raw: string[] | undefined): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];

  for (const tag of raw ?? []) {
    const value = tag
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    clean.push(value);
  }

  const required = REQUIRED_HASHTAGS.filter((tag) => !seen.has(tag));
  // Trim to leave room for the required tags, then put them at the front:
  // #planttok is the one that has to survive.
  const room = Math.max(0, MAX_HASHTAGS - required.length);
  return [...required, ...clean.slice(0, room)];
}

/**
 * The CTA and Hook/Outro shelves of the library, read once per carousel.
 *
 * Bounded by the store's own listing cap, so this is one read however large
 * the library grows.
 */
async function loadShelves(): Promise<{ cta: MediaAsset[]; hook: MediaAsset[] }> {
  const known = new Set(PLANTS.map((p) => p.slug));
  const all = await getStore().listMedia();
  return {
    cta: all.filter((a) => shelfOf(a, known) === "cta"),
    hook: all.filter((a) => shelfOf(a, known) === "hook"),
  };
}

/** The least-used image of a pool, removed from it so it is not reused. */
function takeLeastUsed(pool: MediaAsset[]): MediaAsset | undefined {
  const pick = leastUsed(pool);
  if (pick) pool.splice(pool.indexOf(pick), 1);
  return pick;
}

/**
 * Puts a carousel's slides in a new order.
 *
 * `order` lists the current slide positions in their new sequence: [2, 0, 1]
 * makes the third slide first. Everything that belongs to a slide travels with
 * it - its words in every language, its layout, its photograph and the
 * composites already burned from it - because they are all stored ON the
 * slide, so a reorder cannot separate an image from its text.
 *
 * The cover follows its slide too: the image chosen as cover stays the cover,
 * wherever it now sits.
 */
export async function reorderSlides(
  id: string,
  order: number[],
): Promise<CarouselRecord> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`Aucun carrousel avec l'identifiant ${id}.`);
  if (carousel.status === "generating") {
    throw badRequest("Ce carrousel est encore en cours de création : attends qu'il soit terminé.");
  }

  const n = carousel.slides.length;
  const isPermutation =
    order.length === n &&
    new Set(order).size === n &&
    order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  if (!isPermutation) {
    throw badRequest("Le nouvel ordre ne correspond pas aux slides de ce carrousel.");
  }

  const slides = order.map((i) => carousel.slides[i]!);
  // coverIndex is 1-based: find where the old cover slide went.
  const coverIndex = order.indexOf(carousel.coverIndex - 1) + 1 || 1;

  const updated: CarouselRecord = {
    ...carousel,
    slides,
    coverIndex,
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);
  return updated;
}

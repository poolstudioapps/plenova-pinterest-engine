import "server-only";
import { getPlant } from "@/lib/data/plants";
import {
  matchPlantSlug,
  plantName as localizedPlantName,
} from "@/lib/data/localize";
import { getVisualStyle } from "@/lib/data/visual-styles";
import { badRequest, notFound } from "@/lib/errors";
import {
  generateCarouselConcept,
  generatePinImage,
  reinterpretImage,
} from "@/lib/gemini";
import { DEFAULT_LOCALE, type ContentLocale } from "@/lib/i18n";
import { extensionFor, hostImageAt } from "@/lib/images";
import { mediaPath, varietySlug } from "@/lib/media";
import { findReference, isPexelsConfigured } from "@/lib/pexels";
import { getStore } from "@/lib/store";
import { getPublishStatus, publishCarousel } from "@/lib/tiktok";
import type {
  CarouselPost,
  CarouselRecord,
  CarouselSlide,
  MediaAsset,
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
  if (theme.length < 3) throw badRequest("Describe the carousel theme.");

  const languages =
    input.languages && input.languages.length > 0
      ? Array.from(new Set(input.languages))
      : [DEFAULT_LOCALE as ContentLocale];

  const plant = input.plantSlug ? getPlant(input.plantSlug) : undefined;
  if (input.plantSlug && !plant) {
    throw badRequest(`Unknown plant: ${input.plantSlug}`);
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
    const store = getStore();
    const carousel = await store.getCarousel(id);
    if (!carousel) return;
    await store.saveCarousel({
      ...carousel,
      status: "failed",
      error: err instanceof Error ? err.message : "Generation failed.",
      updatedAt: new Date().toISOString(),
    });
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
      : [DEFAULT_LOCALE as ContentLocale];

  const store = getStore();
  const plant = input.plantSlug ? getPlant(input.plantSlug) : undefined;
  if (input.plantSlug && !plant) {
    throw badRequest(`Unknown plant: ${input.plantSlug}`);
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

  // Produced in order so a failure names the slide it belongs to, rather than
  // surfacing as one opaque batch error.
  const slides: CarouselSlide[] = [];
  for (const [index, draft] of concept.slides.entries()) {
    const recycled = source === "library" ? reusable[reuseCursor++] : undefined;
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

    const text: CarouselSlide["text"] = {};
    for (const lang of languages) {
      const title = draft.title[lang];
      if (!title) continue;
      text[lang] = { title, subtitle: draft.subtitle[lang] ?? "" };
    }

    slides.push({
      kind: draft.kind,
      // midCtaIndex is 1-based, as the model was asked for.
      hasPlenovaMention: index + 1 === concept.midCtaIndex,
      text,
      imagePrompt: draft.imagePrompt,
      photoQuery: draft.photoQuery,
      mediaId: asset.id,
      imageUrl: asset.url,
      composed: {},
    });
  }

  // Hashtags ride at the end of the caption, which is how TikTok reads them.
  const caption: CarouselRecord["caption"] = {};
  for (const lang of languages) {
    const tags = (concept.hashtags[lang] ?? []).map((h) => `#${h}`).join(" ");
    caption[lang] = [concept.caption[lang] ?? "", tags]
      .filter(Boolean)
      .join("\n\n");
  }

  const started = await store.getCarousel(id);
  const record: CarouselRecord = {
    id,
    languages,
    theme,
    caption,
    hashtags: concept.hashtags,
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
    // Broad query first, then the plant alone: a literal scene rarely matches,
    // but the subject almost always does.
    const reference = await findReference([
      input.photoQuery,
      `${input.plantName} plant indoor`,
      "houseplant interior",
    ]);
    if (reference) {
      image = await reinterpretImage(
        { data: reference.data, mimeType: "image/jpeg" },
        input.imagePrompt,
        SLIDE_ASPECT,
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
export async function saveComposedSlide(
  id: string,
  index: number,
  language: ContentLocale,
  data: Buffer,
  mimeType: string,
): Promise<CarouselRecord> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`No carousel with id ${id}.`);

  const slide = carousel.slides[index];
  if (!slide) throw badRequest(`Slide ${index} does not exist on this carousel.`);

  const hosted = await hostImageAt(
    `carousels/${id}/${language}/slide-${index + 1}.${extensionFor(mimeType)}`,
    data,
    mimeType,
  );

  const slides = carousel.slides.map((s, i) =>
    i === index
      ? { ...s, composed: { ...s.composed, [language]: hosted.url } }
      : s,
  );

  // File the composite alongside the bare photograph. It is what actually gets
  // published, so it belongs in the library where it can be reviewed and
  // reused - filed under the same species as the photograph it came from.
  const bare = slide.mediaId ? await store.getMedia(slide.mediaId) : null;
  const now = new Date().toISOString();
  await store.saveMedia({
    id: `${slide.mediaId ?? `med_${id}_${index}`}_${language}`,
    plantSlug: bare?.plantSlug ?? carousel.plantSlug ?? "unfiled",
    plantName: bare?.plantName ?? carousel.plantName ?? carousel.theme,
    variety: bare?.variety ?? null,
    varietySlug: bare?.varietySlug ?? null,
    url: hosted.url,
    mimeType,
    aspectRatio: bare?.aspectRatio ?? "4:5",
    prompt: slide.imagePrompt,
    visualStyle: "carousel-slide",
    angleSlug: null,
    source: "carousel",
    sourceId: `${id}_${index}`,
    referencePhotographer: bare?.referencePhotographer ?? null,
    tags: [language, "slide"],
    usedCount: 1,
    lastUsedAt: now,
    createdAt: now,
  });

  const updated: CarouselRecord = {
    ...carousel,
    slides,
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);
  return updated;
}

/** The images to publish for one language, composites where they exist. */
export function slideUrlsFor(
  carousel: CarouselRecord,
  language: ContentLocale,
): string[] {
  return carousel.slides
    .map((s) => s.composed[language] ?? s.imageUrl)
    .filter((u): u is string => Boolean(u));
}

export interface PublishOptions {
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  privacyLevel?: string;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
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
  if (!carousel) throw notFound(`No carousel with id ${id}.`);
  if (openIds.length === 0) throw badRequest("Select at least one account.");

  await store.saveCarousel({
    ...carousel,
    status: "publishing",
    updatedAt: new Date().toISOString(),
  });

  const posts: CarouselPost[] = [];

  for (const openId of openIds) {
    const account = await store.getTikTokAccount(openId);
    if (!account) {
      posts.push(
        failedPost(openId, "", DEFAULT_LOCALE as ContentLocale, options, "Account is not connected."),
      );
      continue;
    }

    // Already posted to this account? Never create a second post for it.
    const previous = carousel.posts.find(
      (p) => p.openId === openId && p.publishId,
    );
    if (previous) {
      posts.push(previous);
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
          `This carousel has nothing written in ${language}.`,
        ),
      );
      continue;
    }

    try {
      const { publishId } = await publishCarousel({
        openId,
        // TikTok takes the first line as the title.
        title: (
          carousel.slides[0]?.text[language]?.title ?? carousel.theme
        ).slice(0, 90),
        description: caption,
        imageUrls: urls,
        coverIndex: carousel.coverIndex,
        postMode: options.postMode,
        privacyLevel: options.privacyLevel,
        brandContentToggle: options.brandContentToggle,
        brandOrganicToggle: options.brandOrganicToggle,
      });

      // A publish id only means TikTok accepted the request. It then fetches
      // every slide and can still fail - a rejected image, a blocked domain.
      // Reporting success on the id alone would be reporting a lie.
      const outcome = await confirmPublish(openId, publishId);

      posts.push({
        openId,
        username: account.username,
        language,
        postMode: options.postMode,
        privacyLevel: options.privacyLevel ?? null,
        brandContentToggle: Boolean(options.brandContentToggle),
        brandOrganicToggle: Boolean(options.brandOrganicToggle),
        publishId: outcome.failed ? null : publishId,
        publishedAt: outcome.failed ? null : new Date().toISOString(),
        error: outcome.failed
          ? `TikTok rejected the post: ${outcome.reason ?? "unknown reason"}`
          : null,
      });
    } catch (err) {
      posts.push(
        failedPost(
          openId,
          account.username,
          language,
          options,
          err instanceof Error ? err.message : "Publishing failed.",
        ),
      );
    }
  }

  // Keep results for accounts that were not part of this run.
  const untouched = carousel.posts.filter(
    (p) => !posts.some((n) => n.openId === p.openId),
  );
  const allPosts = [...untouched, ...posts];
  const publishedCount = posts.filter((p) => p.publishId).length;

  const updated: CarouselRecord = {
    ...carousel,
    posts: allPosts,
    status: allPosts.some((p) => p.publishId) ? "published" : "failed",
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);

  return {
    carousel: updated,
    posts,
    publishedCount,
    failedCount: posts.length - publishedCount,
  };
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
    error,
  };
}


/**
 * Waits briefly for TikTok to confirm a post.
 *
 * Publishing is asynchronous: the init call returns an id, then TikTok pulls
 * every slide and can still reject the whole thing. A short bounded check
 * catches the immediate failures - a blocked image, an unreachable domain -
 * without holding the request open for a job that may take minutes.
 *
 * Anything still processing counts as accepted: it usually completes, and the
 * publish id is recorded either way so it can be checked later.
 */
async function confirmPublish(
  openId: string,
  publishId: string,
): Promise<{ failed: boolean; reason: string | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const { status, failReason } = await getPublishStatus(openId, publishId);
      if (status === "FAILED") return { failed: true, reason: failReason };
      if (status === "PUBLISH_COMPLETE") return { failed: false, reason: null };
    } catch {
      // The status endpoint being unavailable is not evidence of failure.
      return { failed: false, reason: null };
    }
  }
  return { failed: false, reason: null };
}

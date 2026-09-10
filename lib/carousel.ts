import "server-only";
import { config } from "@/lib/config";
import { getPlant } from "@/lib/data/plants";
import { plantName as localizedPlantName } from "@/lib/data/localize";
import { badRequest, notFound } from "@/lib/errors";
import { generateCarouselConcept, generatePinImage } from "@/lib/gemini";
import { extensionFor, hostImageAt } from "@/lib/images";
import { mediaPath, varietySlug } from "@/lib/media";
import { getStore } from "@/lib/store";
import { publishCarousel } from "@/lib/tiktok";
import type { CarouselRecord, CarouselSlide, MediaAsset } from "@/lib/types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { getVisualStyle } from "@/lib/data/visual-styles";

/**
 * Carousel orchestration: theme in, publishable carousel out.
 *
 * The order matters and was wrong in the first version. A carousel starts from
 * a THEME. Gemini designs the slides - overlay copy and a photography brief
 * each - and only then are the images generated from those briefs. Assembling
 * a carousel out of whatever images already existed produced a slideshow with
 * no argument running through it.
 *
 * Every generated image still lands in the media library, so it stays reusable
 * by the Pinterest side and by later carousels.
 */

function carouselId(): string {
  return `car_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Slide images are square-ish 4:5, TikTok's carousel format. */
const SLIDE_ASPECT = "4:5";

export interface GenerateCarouselInput {
  theme: string;
  locale?: Locale;
  /** Optional: anchors the carousel to one species from the catalog. */
  plantSlug?: string;
  variety?: string;
}

export async function generateCarousel(
  input: GenerateCarouselInput,
): Promise<CarouselRecord> {
  const theme = input.theme.trim();
  if (theme.length < 3) throw badRequest("Describe the carousel theme.");

  const locale = input.locale ?? DEFAULT_LOCALE;
  const store = getStore();

  const plant = input.plantSlug ? getPlant(input.plantSlug) : undefined;
  if (input.plantSlug && !plant) {
    throw badRequest(`Unknown plant: ${input.plantSlug}`);
  }

  // Past themes go back into the prompt so a new carousel does not re-tread one.
  const existing = await store.listCarousels();
  const concept = await generateCarouselConcept({
    theme,
    locale,
    plantName: plant ? localizedPlantName(plant, locale) : undefined,
    existingThemes: existing.map((c) => c.theme).filter(Boolean),
  });

  const id = carouselId();
  const vSlug = varietySlug(input.variety);

  // Images are generated in order so a failure is reported against the slide it
  // belongs to, rather than as one opaque batch error.
  const slides: CarouselSlide[] = [];
  for (const [index, draft] of concept.slides.entries()) {
    const asset = await generateSlideImage({
      id: `${id}_${index}`,
      imagePrompt: draft.imagePrompt,
      plantSlug: plant?.slug ?? "carousel",
      plantName: plant ? localizedPlantName(plant, locale) : theme,
      variety: input.variety ?? null,
      varietySlug: vSlug,
      theme,
    });

    slides.push({
      kind: draft.kind,
      title: draft.title,
      subtitle: draft.subtitle,
      imagePrompt: draft.imagePrompt,
      mediaId: asset.id,
      imageUrl: asset.url,
      composedUrl: null,
    });
  }

  const now = new Date().toISOString();
  const hashtagLine = concept.hashtags.map((h) => `#${h}`).join(" ");

  const record: CarouselRecord = {
    id,
    locale,
    theme,
    // TikTok shows the first line as the title, so the hook doubles as it.
    title: (slides[0]?.title ?? theme).slice(0, 90),
    description: [concept.caption, hashtagLine].filter(Boolean).join("\n\n"),
    hashtags: concept.hashtags,
    slides,
    slideUrls: slides.map((s) => s.composedUrl ?? s.imageUrl!).filter(Boolean),
    coverIndex: 1,

    plantSlug: plant?.slug ?? null,
    plantName: plant ? localizedPlantName(plant, locale) : null,

    status: "draft",
    postMode: "DIRECT_POST",
    privacyLevel: null,
    brandContentToggle: false,
    brandOrganicToggle: false,

    publishId: null,
    publishedAt: null,
    error: null,

    createdAt: now,
    updatedAt: now,
  };

  await store.saveCarousel(record);
  return record;
}

/** Generates one slide image and files it in the media library. */
async function generateSlideImage(input: {
  id: string;
  imagePrompt: string;
  plantSlug: string;
  plantName: string;
  variety: string | null;
  varietySlug: string | null;
  theme: string;
}): Promise<MediaAsset> {
  // Slides carry their text as an overlay rather than baked in, so the image
  // itself must stay clean - the editorial style forbids text outright.
  const style = getVisualStyle("editorial-photo")!;
  const image = await generatePinImage(input.imagePrompt, style);

  const mediaId = `med_${input.id}`;
  const path = mediaPath(
    {
      plantSlug: input.plantSlug,
      varietySlug: input.varietySlug,
      id: mediaId,
    },
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

export async function updateCarousel(
  id: string,
  patch: Partial<Pick<CarouselRecord, "title" | "description" | "coverIndex">>,
): Promise<CarouselRecord> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`No carousel with id ${id}.`);

  const updated: CarouselRecord = {
    ...carousel,
    ...patch,
    coverIndex: Math.min(
      Math.max(1, patch.coverIndex ?? carousel.coverIndex),
      Math.max(1, carousel.slideUrls.length),
    ),
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);
  return updated;
}

export interface PublishOutcome {
  carousel: CarouselRecord;
  published: boolean;
  error?: string;
}

/**
 * Publishes to TikTok. As on the Pinterest side, a carousel only reaches
 * `published` when TikTok returns a publish id.
 */
export async function publishCarouselRecord(
  id: string,
  options: {
    postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
    privacyLevel?: string;
    brandContentToggle?: boolean;
    brandOrganicToggle?: boolean;
  },
): Promise<PublishOutcome> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`No carousel with id ${id}.`);

  if (carousel.status === "published" && carousel.publishId) {
    // Idempotent: never create a second post for the same record.
    return { carousel, published: true };
  }

  const publishing: CarouselRecord = {
    ...carousel,
    status: "publishing",
    postMode: options.postMode,
    privacyLevel: options.privacyLevel ?? null,
    brandContentToggle: Boolean(options.brandContentToggle),
    brandOrganicToggle: Boolean(options.brandOrganicToggle),
    error: null,
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(publishing);

  try {
    const { publishId } = await publishCarousel({
      title: publishing.title,
      description: publishing.description,
      imageUrls: publishing.slideUrls,
      coverIndex: publishing.coverIndex,
      postMode: options.postMode,
      privacyLevel: options.privacyLevel,
      brandContentToggle: options.brandContentToggle,
      brandOrganicToggle: options.brandOrganicToggle,
    });

    const published: CarouselRecord = {
      ...publishing,
      status: "published",
      publishId,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.saveCarousel(published);
    return { carousel: published, published: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Publishing failed for an unknown reason.";
    const failed: CarouselRecord = {
      ...publishing,
      status: "failed",
      error: message,
      updatedAt: new Date().toISOString(),
    };
    await store.saveCarousel(failed);
    return { carousel: failed, published: false, error: message };
  }
}

/** The destination every Plenova post points at. */
export const CAROUSEL_LINK = config.app.oneLink;


/**
 * Records a slide composed in the operator's browser.
 *
 * The bare photograph is kept as-is in the media library; only the carousel
 * points at the composed version, so the same image can back another carousel
 * with different text later.
 */
export async function saveComposedSlide(
  carouselId: string,
  index: number,
  data: Buffer,
  mimeType: string,
): Promise<CarouselRecord> {
  const store = getStore();
  const carousel = await store.getCarousel(carouselId);
  if (!carousel) throw notFound(`No carousel with id ${carouselId}.`);

  const slide = carousel.slides[index];
  if (!slide) throw badRequest(`Slide ${index} does not exist on this carousel.`);

  const hosted = await hostImageAt(
    `carousels/${carouselId}/slide-${index + 1}.${extensionFor(mimeType)}`,
    data,
    mimeType,
  );

  const slides = carousel.slides.map((s, i) =>
    i === index ? { ...s, composedUrl: hosted.url } : s,
  );

  const updated: CarouselRecord = {
    ...carousel,
    slides,
    slideUrls: slides
      .map((s) => s.composedUrl ?? s.imageUrl)
      .filter((u): u is string => Boolean(u)),
    updatedAt: new Date().toISOString(),
  };
  await store.saveCarousel(updated);
  return updated;
}

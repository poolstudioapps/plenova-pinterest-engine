import "server-only";
import { badRequest, notFound } from "@/lib/errors";
import { getStore } from "@/lib/store";
import { publishCarousel } from "@/lib/tiktok";
import type { CarouselRecord } from "@/lib/types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * Carousel orchestration.
 *
 * A carousel is an ordered set of media-library assets plus one caption. It
 * deliberately reuses the same library the Pinterest side fills, which is the
 * whole point of indexing images by plant: a photograph paid for once by a Pin
 * becomes a TikTok slide for free.
 */

function carouselId(): string {
  return `car_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateCarouselInput {
  slideIds: string[];
  title: string;
  description: string;
  locale?: Locale;
  coverIndex?: number;
}

export async function createCarousel(
  input: CreateCarouselInput,
): Promise<CarouselRecord> {
  if (input.slideIds.length === 0) {
    throw badRequest("A carousel needs at least one slide.");
  }

  const store = getStore();
  const assets = await Promise.all(input.slideIds.map((id) => store.getMedia(id)));

  const missing = input.slideIds.filter((_, i) => !assets[i]);
  if (missing.length > 0) {
    throw badRequest(`Unknown media asset(s): ${missing.join(", ")}`);
  }

  const resolved = assets.filter((a): a is NonNullable<typeof a> => Boolean(a));
  const inline = resolved.find((a) => a.url.startsWith("data:"));
  if (inline) {
    throw badRequest(
      "One slide is stored inline and TikTok could not fetch it. Attach a Blob store and regenerate that image.",
    );
  }

  // Every slide of a carousel should be the same plant; take it from the first.
  const first = resolved[0]!;
  const now = new Date().toISOString();

  const record: CarouselRecord = {
    id: carouselId(),
    locale: input.locale ?? DEFAULT_LOCALE,
    title: input.title.trim().slice(0, 90),
    description: input.description.trim().slice(0, 4000),
    slideIds: input.slideIds,
    slideUrls: resolved.map((a) => a.url),
    coverIndex: Math.min(Math.max(1, input.coverIndex ?? 1), resolved.length),

    plantSlug: first.plantSlug,
    plantName: first.plantName,

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
  // Reuse accounting, so the picker can prefer images that have had less use.
  await Promise.all(input.slideIds.map((id) => store.markMediaUsed(id)));
  return record;
}

export async function updateCarousel(
  id: string,
  patch: Partial<
    Pick<CarouselRecord, "title" | "description" | "coverIndex" | "slideIds">
  >,
): Promise<CarouselRecord> {
  const store = getStore();
  const carousel = await store.getCarousel(id);
  if (!carousel) throw notFound(`No carousel with id ${id}.`);

  let slideUrls = carousel.slideUrls;
  if (patch.slideIds) {
    const assets = await Promise.all(patch.slideIds.map((s) => store.getMedia(s)));
    if (assets.some((a) => !a)) throw badRequest("One slide no longer exists.");
    slideUrls = assets.map((a) => a!.url);
  }

  const updated: CarouselRecord = {
    ...carousel,
    ...patch,
    slideUrls,
    coverIndex: Math.min(
      Math.max(1, patch.coverIndex ?? carousel.coverIndex),
      slideUrls.length,
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
 * Publishes to TikTok.
 *
 * As on the Pinterest side, a carousel only reaches `published` when TikTok
 * returns a publish id. Anything else records the failure and reports it.
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

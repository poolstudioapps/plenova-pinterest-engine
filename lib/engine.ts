import "server-only";
import { config } from "@/lib/config";
import { getAngle } from "@/lib/data/angles";
import { getPlant } from "@/lib/data/plants";
import { getVisualStyle, pickVisualStyle } from "@/lib/data/visual-styles";
import { badRequest, duplicate, notFound } from "@/lib/errors";
import { generatePinCopy, generatePinImage } from "@/lib/gemini";
import { dedupeKey, pinId } from "@/lib/ids";
import { extensionFor, hostImageAt } from "@/lib/images";
import { mediaPath, varietySlug } from "@/lib/media";
import { getStore } from "@/lib/store";
import type {
  ContentAngle,
  MediaAsset,
  PinRecord,
  Plant,
  VisualStyle,
} from "@/lib/types";
import { DEFAULT_LOCALE, type ContentLocale } from "@/lib/i18n";
import { angleLabel as angleLabelFor, plantName } from "@/lib/data/localize";

/**
 * Generation orchestration: resolve the slot, guard against duplicates, call
 * Gemini for copy then image, host the image, persist the record.
 */

export interface GenerateInput {
  plantSlug: string;
  angleSlug: string;
  /** Language the Pin copy is written in. Defaults to English. */
  locale?: ContentLocale;
  visualStyle?: string;
  customAngle?: string;
  variation?: number;
  /** When true, an existing Pin in the same slot is replaced instead of refused. */
  allowDuplicate?: boolean;
  /** Free-form cultivar, e.g. "variegata". Indexes the image in the library. */
  variety?: string;
  /**
   * Reuse an image already in the media library instead of generating one.
   * Skips the image model entirely - the expensive half of a generation.
   */
  reuseMediaId?: string;
}

interface ResolvedSlot {
  plant: Plant;
  angle: ContentAngle;
  style: VisualStyle;
  variation: number;
  locale: ContentLocale;
  key: string;
}

function resolveSlot(input: GenerateInput): ResolvedSlot {
  const plant = getPlant(input.plantSlug);
  if (!plant) throw badRequest(`Unknown plant: ${input.plantSlug}`);

  const angle = getAngle(input.angleSlug);
  if (!angle) throw badRequest(`Unknown angle: ${input.angleSlug}`);

  const variation = Number.isFinite(input.variation)
    ? Math.max(0, Math.trunc(input.variation!))
    : 0;

  // An explicit style wins; otherwise derive one deterministically from the
  // slot so the same request always resolves to the same composition.
  const style = input.visualStyle
    ? (getVisualStyle(input.visualStyle) ??
      (() => {
        throw badRequest(`Unknown visual style: ${input.visualStyle}`);
      })())
    : pickVisualStyle(
        angle.category,
        hashSeed(plant.slug, angle.slug) + variation,
      );

  const locale = input.locale ?? (DEFAULT_LOCALE as ContentLocale);
  const vSlug = varietySlug(input.variety);

  return {
    plant,
    angle,
    style,
    variation,
    locale,
    key: dedupeKey({
      plantSlug: plant.slug,
      angleSlug: angle.slug,
      visualStyle: style.slug,
      variation,
      locale,
      varietySlug: vSlug,
    }),
  };
}

/** Small stable string hash - keeps style selection deterministic per slot. */
function hashSeed(...parts: string[]): number {
  const raw = parts.join("|");
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (h * 31 + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export async function generatePin(input: GenerateInput): Promise<PinRecord> {
  const slot = resolveSlot(input);
  const store = getStore();

  const existing = await store.findByDedupeKey(slot.key);
  if (existing && !input.allowDuplicate) {
    throw duplicate(
      `A Pin already exists for ${slot.plant.name}${input.variety ? ` '${input.variety}'` : ""} / ${slot.angle.label} (variation ${slot.variation}). Bump the variation or enable "allow duplicate".`,
      { existingPinId: existing.id },
    );
  }

  // Feed prior titles back into the prompt so variations genuinely diverge.
  const existingTitles = await store.titlesForPlant(slot.plant.slug, slot.locale);

  const copy = await generatePinCopy({
    plant: slot.plant,
    angle: slot.angle,
    style: slot.style,
    variation: slot.variation,
    locale: slot.locale,
    customAngle: input.customAngle,
    existingTitles,
  });

  const id = existing?.id ?? pinId();

  // Reusing a library image skips the image model - the expensive half of a
  // generation, and the whole point of keeping a library per plant.
  let imageUrl: string;
  let imageIsInline: boolean;
  let mediaId: string | null;

  if (input.reuseMediaId) {
    const asset = await store.getMedia(input.reuseMediaId);
    if (!asset) throw notFound(`No media asset with id ${input.reuseMediaId}.`);
    imageUrl = asset.url;
    imageIsInline = asset.url.startsWith("data:");
    mediaId = asset.id;
    await store.markMediaUsed(asset.id);
  } else {
    const image = await generatePinImage(copy.imagePrompt, slot.style);
    const asset = await registerMedia({
      plant: slot.plant,
      plantName: plantName(slot.plant, slot.locale),
      variety: input.variety ?? null,
      style: slot.style.slug,
      angleSlug: slot.angle.slug,
      prompt: copy.imagePrompt,
      data: image.data,
      mimeType: image.mimeType,
      sourceId: id,
      keywords: copy.keywords,
    });
    imageUrl = asset.url;
    imageIsInline = asset.url.startsWith("data:");
    mediaId = asset.id;
  }

  const now = new Date().toISOString();
  const record: PinRecord = {
    id,
    locale: slot.locale,
    dedupeKey: slot.key,
    plantSlug: slot.plant.slug,
    plantName: plantName(slot.plant, slot.locale),
    angleSlug: slot.angle.slug,
    angleLabel: angleLabelFor(slot.angle, slot.locale === "fr" ? "fr" : "en"),
    visualStyle: slot.style.slug,
    variation: slot.variation,
    variety: input.variety ?? null,
    mediaId,

    title: copy.title,
    description: copy.description,
    keywords: copy.keywords,
    altText: copy.altText,
    imagePrompt: copy.imagePrompt,

    imageUrl,
    imageIsInline,

    link: config.app.oneLink,
    boardId: existing?.boardId ?? null,
    boardName: existing?.boardName ?? null,

    status: "generated",
    scheduledAt: null,
    publishedAt: null,
    pinterestPinId: null,
    error: null,
    attempts: 0,

    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await store.savePin(record);
  return record;
}

/** Applies a partial edit from the Library / preview editor. */
export async function updatePin(
  id: string,
  patch: Partial<
    Pick<
      PinRecord,
      | "title"
      | "description"
      | "keywords"
      | "altText"
      | "boardId"
      | "boardName"
      | "status"
      | "scheduledAt"
    >
  >,
): Promise<PinRecord> {
  const store = getStore();
  const pin = await store.getPin(id);
  if (!pin) throw notFound(`No Pin with id ${id}.`);

  const updated: PinRecord = {
    ...pin,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await store.savePin(updated);
  return updated;
}


/**
 * Stores a freshly generated image in the media library, under a path keyed by
 * plant and cultivar. Every image the engine pays for lands here exactly once,
 * so it can back a later Pin - or a TikTok slide - without a second call to the
 * image model.
 */
async function registerMedia(input: {
  plant: Plant;
  plantName: string;
  variety: string | null;
  style: string;
  angleSlug: string;
  prompt: string;
  data: Buffer;
  mimeType: string;
  sourceId: string;
  keywords: string[];
}): Promise<MediaAsset> {
  const id = `med_${input.sourceId.replace(/^pin_/, "")}`;
  const vSlug = varietySlug(input.variety);
  const path = mediaPath(
    { plantSlug: input.plant.slug, varietySlug: vSlug, id },
    extensionFor(input.mimeType),
  );

  const hosted = await hostImageAt(path, input.data, input.mimeType);

  const asset: MediaAsset = {
    id,
    plantSlug: input.plant.slug,
    plantName: input.plantName,
    variety: input.variety,
    varietySlug: vSlug,
    url: hosted.url,
    mimeType: input.mimeType,
    aspectRatio: "2:3",
    prompt: input.prompt,
    visualStyle: input.style,
    angleSlug: input.angleSlug,
    source: "pin",
    sourceId: input.sourceId,
    tags: input.keywords.slice(0, 8),
    usedCount: 1,
    lastUsedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await getStore().saveMedia(asset);
  return asset;
}

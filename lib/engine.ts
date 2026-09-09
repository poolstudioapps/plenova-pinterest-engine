import "server-only";
import { config } from "@/lib/config";
import { getAngle } from "@/lib/data/angles";
import { getPlant } from "@/lib/data/plants";
import { getVisualStyle, pickVisualStyle } from "@/lib/data/visual-styles";
import { badRequest, duplicate, notFound } from "@/lib/errors";
import { generatePinCopy, generatePinImage } from "@/lib/gemini";
import { dedupeKey, pinId } from "@/lib/ids";
import { hostPinImage } from "@/lib/images";
import { getStore } from "@/lib/store";
import type { ContentAngle, PinRecord, Plant, VisualStyle } from "@/lib/types";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { angleLabel as angleLabelFor, plantName } from "@/lib/data/localize";

/**
 * Generation orchestration: resolve the slot, guard against duplicates, call
 * Gemini for copy then image, host the image, persist the record.
 */

export interface GenerateInput {
  plantSlug: string;
  angleSlug: string;
  /** Language the Pin copy is written in. Defaults to English. */
  locale?: Locale;
  visualStyle?: string;
  customAngle?: string;
  variation?: number;
  /** When true, an existing Pin in the same slot is replaced instead of refused. */
  allowDuplicate?: boolean;
}

interface ResolvedSlot {
  plant: Plant;
  angle: ContentAngle;
  style: VisualStyle;
  variation: number;
  locale: Locale;
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

  const locale = input.locale ?? DEFAULT_LOCALE;

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
      `A Pin already exists for ${slot.plant.name} / ${slot.angle.label} (variation ${slot.variation}). Bump the variation or enable "allow duplicate".`,
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
  const image = await generatePinImage(copy.imagePrompt, slot.style);
  const hosted = await hostPinImage(id, image.data, image.mimeType);

  const now = new Date().toISOString();
  const record: PinRecord = {
    id,
    locale: slot.locale,
    dedupeKey: slot.key,
    plantSlug: slot.plant.slug,
    plantName: plantName(slot.plant, slot.locale),
    angleSlug: slot.angle.slug,
    angleLabel: angleLabelFor(slot.angle, slot.locale),
    visualStyle: slot.style.slug,
    variation: slot.variation,

    title: copy.title,
    description: copy.description,
    keywords: copy.keywords,
    altText: copy.altText,
    imagePrompt: copy.imagePrompt,

    imageUrl: hosted.url,
    imageIsInline: hosted.inline,

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

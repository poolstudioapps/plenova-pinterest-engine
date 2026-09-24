import "server-only";
import { randomToken } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";
import { normaliseOverlay } from "@/lib/overlay";
import { cleanSlideTexts, hasWords } from "@/lib/slide-text";
import { getStore } from "@/lib/store";
import type { SlideTemplate } from "@/lib/types";

/**
 * Slides kept ready for any carousel - the Plenova CTA above all.
 *
 * A saved slide is a photograph from the library, a layout, and its words in
 * as many languages as it was written in. Dropped into a carousel it brings
 * the words of that carousel's languages; a language it lacks comes in empty
 * and is flagged in the editor, never silently filled with another language.
 */

export interface SlideTemplateInput {
  name?: unknown;
  kind?: unknown;
  mediaId?: unknown;
  overlay?: unknown;
  text?: unknown;
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  if (!name) throw badRequest("Donne un nom à cette slide.");
  return name;
}

function cleanKind(raw: unknown): SlideTemplate["kind"] {
  return raw === "cta" ? "cta" : "content";
}

/** Only the languages that were actually written: an empty one says "missing". */
function cleanTexts(raw: unknown): SlideTemplate["text"] {
  const all = cleanSlideTexts(raw);
  const out: SlideTemplate["text"] = {};
  for (const [language, text] of Object.entries(all)) {
    if (hasWords(text)) out[language as keyof SlideTemplate["text"]] = text;
  }
  return out;
}

async function photoFor(mediaId: unknown): Promise<{ mediaId: string; imageUrl: string }> {
  if (typeof mediaId !== "string" || !mediaId) {
    throw badRequest("Une slide prête a besoin d'une photo de la bibliothèque.");
  }
  const asset = await getStore().getMedia(mediaId);
  if (!asset) throw notFound(`Aucune image avec l'identifiant ${mediaId}.`);
  return { mediaId: asset.id, imageUrl: asset.url };
}

export async function listTemplates(): Promise<SlideTemplate[]> {
  return getStore().listSlideTemplates();
}

export async function createTemplate(input: SlideTemplateInput): Promise<SlideTemplate> {
  const now = new Date().toISOString();
  const template: SlideTemplate = {
    id: `tpl_${randomToken(9)}`,
    name: cleanName(input.name),
    kind: cleanKind(input.kind),
    ...(await photoFor(input.mediaId)),
    overlay: normaliseOverlay(input.overlay),
    text: cleanTexts(input.text),
    createdAt: now,
    updatedAt: now,
  };
  await getStore().saveSlideTemplate(template);
  return template;
}

export async function updateTemplate(
  id: string,
  input: SlideTemplateInput,
): Promise<SlideTemplate> {
  const store = getStore();
  const current = await store.getSlideTemplate(id);
  if (!current) throw notFound(`Aucune slide prête avec l'identifiant ${id}.`);

  const next: SlideTemplate = { ...current, updatedAt: new Date().toISOString() };
  if (input.name !== undefined) next.name = cleanName(input.name);
  if (input.kind !== undefined) next.kind = cleanKind(input.kind);
  if (input.text !== undefined) next.text = cleanTexts(input.text);
  if (input.overlay !== undefined) next.overlay = normaliseOverlay(input.overlay);
  if (input.mediaId !== undefined && input.mediaId !== current.mediaId) {
    Object.assign(next, await photoFor(input.mediaId));
  }
  await store.saveSlideTemplate(next);
  return next;
}

export async function deleteTemplate(id: string): Promise<void> {
  const store = getStore();
  if (!(await store.getSlideTemplate(id))) {
    throw notFound(`Aucune slide prête avec l'identifiant ${id}.`);
  }
  await store.deleteSlideTemplate(id);
}

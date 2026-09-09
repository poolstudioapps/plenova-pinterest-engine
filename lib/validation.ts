import { z } from "zod";
import { badRequest } from "@/lib/errors";
import { LOCALES } from "@/lib/i18n";

/** Input validation for every API route (spec §23). */

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "must be a lowercase slug");

const localeSchema = z.enum(LOCALES);

export const generateSchema = z.object({
  plantSlug: slug,
  angleSlug: slug,
  locale: localeSchema.optional(),
  visualStyle: slug.optional(),
  // Free text, so it is length-capped and stripped of control characters.
  customAngle: z
    .string()
    .max(400)
    .transform((s) => s.replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .optional(),
  variation: z.number().int().min(0).max(999).optional(),
  allowDuplicate: z.boolean().optional(),
});

export const updatePinSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(800).optional(),
  keywords: z.array(z.string().min(1).max(60)).max(12).optional(),
  altText: z.string().max(500).optional(),
  boardId: z.string().min(1).max(120).nullable().optional(),
  boardName: z.string().min(1).max(200).nullable().optional(),
});

export const publishSchema = z.object({
  pinId: z.string().min(1).max(80),
  boardId: z.string().min(1).max(120),
  boardName: z.string().max(200).optional(),
});

export const queueSchema = z.object({
  pinId: z.string().min(1).max(80),
  boardId: z.string().min(1).max(120).optional(),
  boardName: z.string().max(200).optional(),
  // ISO timestamp; omitted means "queue without a specific slot".
  scheduledAt: z.string().datetime().nullable().optional(),
});

export const pinFilterSchema = z.object({
  locale: localeSchema.optional(),
  plantSlug: slug.optional(),
  angleSlug: slug.optional(),
  status: z
    .enum([
      "draft",
      "generated",
      "queued",
      "scheduled",
      "publishing",
      "published",
      "failed",
    ])
    .optional(),
  search: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Parses and rethrows as an AppError so routes share one error shape. */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(
      issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request body.",
    );
  }
  return result.data;
}

/** Reads and validates a JSON body, rejecting malformed payloads cleanly. */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return parseOrThrow(schema, raw);
}

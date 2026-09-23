import "server-only";
import { config, isBlobConfigured } from "@/lib/config";
import { BlobStore } from "./blob";
import { SupabaseStore } from "./supabase";
import { FileStore } from "./file";
import { MemoryStore } from "./memory";
import type { EngineStore } from "./types";

export type { EngineStore, PinFilter } from "./types";

/**
 * Adapter selection, in order of preference:
 *  1. Supabase      - rows, which is the only one of these that cannot lose a
 *                     write to a concurrent one.
 *  2. Vercel Blob   - the previous production path, kept so nothing breaks
 *                     while the data is moved across.
 *  3. Local file    - running outside Vercel, e.g. `npm run dev`.
 *  4. In-memory     - serverless with nothing attached; degrades loudly.
 */
let cached: EngineStore | null = null;

export function getStore(): EngineStore {
  if (cached) return cached;

  if (config.supabase.url && config.supabase.serviceKey) {
    cached = new SupabaseStore();
  } else if (isBlobConfigured()) {
    cached = new BlobStore();
  } else if (!process.env.VERCEL) {
    cached = new FileStore();
  } else {
    console.warn(
      "[store] No Blob store attached. Falling back to in-memory state - Pins will not survive.",
    );
    cached = new MemoryStore();
  }
  return cached;
}

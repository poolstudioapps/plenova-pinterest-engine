import "server-only";
import { config } from "@/lib/config";
import { BlobStore } from "./blob";
import { FileStore } from "./file";
import { MemoryStore } from "./memory";
import type { EngineStore } from "./types";

export type { EngineStore, PinFilter } from "./types";

/**
 * Adapter selection, in order of preference:
 *  1. Vercel Blob   - a Blob store is attached (the production path).
 *  2. Local file    - running outside Vercel, e.g. `npm run dev`.
 *  3. In-memory     - serverless with no Blob store; degrades loudly.
 */
let cached: EngineStore | null = null;

export function getStore(): EngineStore {
  if (cached) return cached;

  if (config.storage.blobToken) {
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

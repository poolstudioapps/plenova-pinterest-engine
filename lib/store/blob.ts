import "server-only";
import { get, put } from "@vercel/blob";
import { blobCredentials, config } from "@/lib/config";
import { derivePathSegment } from "@/lib/crypto";
import { DocumentStore } from "./base";
import { emptyState, type StateDocument } from "./types";

/**
 * Production adapter, backed by Vercel Blob.
 *
 * Access mode is negotiated rather than assumed. The store has to be PUBLIC so
 * Pinterest can fetch Pin images by URL, but the state document should still be
 * private if the store allows mixed access. So we try private first and fall
 * back to public, caching whichever works.
 *
 * Either way the path is derived from TOKEN_ENCRYPTION_KEY, so a public store
 * never exposes the document at a guessable URL, and the OAuth tokens inside
 * are AES-GCM encrypted regardless.
 *
 * Reads use `useCache: false`: the CDN would otherwise serve a stale document
 * straight after a write, which loses Pins.
 *
 * A read that fails throws rather than returning an empty document. The
 * difference matters enormously: callers write back what they read, so
 * answering a transient network error with "there is nothing here" would erase
 * every Pin, carousel and connection on the next save.
 */

/** Errors that genuinely mean "no document yet". */
function isMissing(message: string): boolean {
  return /not.?found|404|no such/i.test(message);
}

/** Errors that mean "wrong access mode" - expected only while probing. */
function isAccessMismatch(message: string): boolean {
  return /access|forbidden|403/i.test(message);
}
function statePath(): string {
  return `engine/state-${derivePathSegment("state-document")}.json`;
}

type Access = "private" | "public";

// Negotiated once per process, then reused.
let accessMode: Access | null = null;

export class BlobStore extends DocumentStore {
  /**
   * Includes the store id so the dashboard shows exactly which Blob store is
   * wired up. Worth the noise: with several stores in a team it is otherwise
   * impossible to tell from inside the app which one you are writing to.
   */
  readonly name = config.storage.blobStoreId
    ? `Vercel Blob (${config.storage.blobStoreId})`
    : "Vercel Blob (static token)";
  readonly persistent = true;

  protected async read(): Promise<StateDocument> {
    const probing = accessMode === null;
    const modes: Access[] = accessMode ? [accessMode] : ["private", "public"];
    let hardError: Error | null = null;

    for (const access of modes) {
      try {
        const result = await get(statePath(), {
          access,
          useCache: false,
          ...blobCredentials(),
        });
        if (!result?.stream) continue;

        const text = await new Response(result.stream).text();
        const parsed = JSON.parse(text) as StateDocument;
        if (parsed.version !== 1 || typeof parsed.pins !== "object") {
          throw new Error(
            "The stored state document is not in a shape this version understands. Refusing to overwrite it.",
          );
        }
        accessMode = access;
        return { ...emptyState(), ...parsed };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // A missing document on first run is expected, as is "wrong access
        // mode" while we are still probing which one the store allows.
        if (isMissing(error.message)) continue;
        if (probing && isAccessMismatch(error.message)) continue;
        console.warn("[blob-store] read failed:", error.message);
        hardError = error;
      }
    }

    if (hardError) throw hardError;
    return emptyState();
  }

  protected async write(doc: StateDocument): Promise<void> {
    const modes: Access[] = accessMode ? [accessMode] : ["private", "public"];
    let lastError: unknown;

    for (const access of modes) {
      try {
        await put(statePath(), JSON.stringify(doc), {
          access,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
          cacheControlMaxAge: 0,
          ...blobCredentials(),
        });
        if (accessMode !== access) {
          console.info(`[blob-store] state document stored with access=${access}`);
        }
        accessMode = access;
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not write the state document to Blob storage.");
  }
}

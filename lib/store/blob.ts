import "server-only";
import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { blobCredentials, config } from "@/lib/config";
import { derivePathSegment } from "@/lib/crypto";
import { DocumentStore } from "./base";
import {
  ConcurrentWrite,
  emptyState,
  type StateDocument,
  type VersionedDocument,
} from "./types";

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

/**
 * Classified by error class, never by message text. The SDK says "The
 * requested blob does not exist" for an absent document and "This store does
 * not exist." for a store that was never created - almost the same sentence,
 * opposite meanings. Reading the first as empty is correct; reading the second
 * as empty would let the app write an empty document over a misconfiguration.
 */
function isMissingDocument(err: unknown): boolean {
  return err instanceof BlobNotFoundError;
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

  protected async load(): Promise<VersionedDocument> {
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
        // No stream means the store answered "unchanged"; we never send a
        // conditional read, so treat it as nothing to load.
        if (!result?.stream) continue;

        const text = await new Response(result.stream).text();
        const parsed = JSON.parse(text) as StateDocument;
        if (parsed.version !== 1 || typeof parsed.pins !== "object") {
          throw new Error(
            "The stored state document is not in a shape this version understands. Refusing to overwrite it.",
          );
        }
        accessMode = access;
        return {
          doc: { ...emptyState(), ...parsed },
          version: result.blob.etag ?? null,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // A missing document on first run is expected, as is being refused
        // while we are still probing which access mode the store allows.
        if (isMissingDocument(err)) continue;
        if (probing) continue;
        console.warn("[blob-store] read failed:", error.message);
        hardError = error;
      }
    }

    if (hardError) throw hardError;
    // Nothing stored yet. No version to be conditional on, so the very first
    // write of a brand new store is the one case that is last-writer-wins.
    return { doc: emptyState(), version: null };
  }

  protected async store(
    doc: StateDocument,
    version: string | null,
  ): Promise<void> {
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
          // Optimistic concurrency: refused outright if anything landed since
          // we loaded, rather than silently overwriting another instance.
          ...(version ? { ifMatch: version } : {}),
          ...blobCredentials(),
        });
        if (accessMode !== access) {
          console.info(`[blob-store] state document stored with access=${access}`);
        }
        accessMode = access;
        return;
      } catch (err) {
        // Losing the race is not an access problem: stop, and let the caller
        // re-apply on top of the document that won.
        if (err instanceof BlobPreconditionFailedError) throw new ConcurrentWrite();
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not write the state document to Blob storage.");
  }
}

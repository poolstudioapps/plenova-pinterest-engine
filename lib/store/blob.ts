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

/**
 * Conditional writes are off, and the reason is measured rather than assumed.
 *
 * `ifMatch` is the documented way to do compare-and-swap here, and it was
 * tried: against this store it refused writes that had no competitor at all,
 * six attempts with backoff in a row, and publishing failed outright. Whatever
 * the cause - the etag a read returns not being the one a write compares
 * against - the effect is that the condition blocks ordinary saves.
 *
 * What replaced it is structural instead. Composing a carousel used to rewrite
 * the whole document twenty-eight times; it now does it twice, so the window
 * where two writes can overlap is small enough to live with, which is how this
 * worked before conditional writes existed at all.
 */
const CONDITIONAL_WRITES = false;

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
    const modes: Access[] = accessMode ? [accessMode] : ["private", "public"];
    let sawMissing = false;
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
        if (!result?.stream) {
          sawMissing = true;
          continue;
        }

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
        if (isMissingDocument(err)) {
          sawMissing = true;
          continue;
        }
        // Being refused under one access mode is expected while probing which
        // one the store allows, so it is only fatal if no mode worked.
        hardError = error;
      }
    }

    // One mode saying "no document" settles it: the store is reachable and
    // there is genuinely nothing there. Without that, every mode failed for
    // some other reason, and calling it empty would let the next save write an
    // empty document over whatever is really stored.
    if (!sawMissing && hardError) {
      console.warn("[blob-store] read failed:", hardError.message);
      throw hardError;
    }

    // Nothing stored yet. No version to be conditional on, so the very first
    // write of a brand new store is the one case that is last-writer-wins.
    return { doc: emptyState(), version: null };
  }

  protected async store(
    doc: StateDocument,
    version: string | null,
  ): Promise<void> {
    const conditional = CONDITIONAL_WRITES && version !== null;
    try {
      await this.put(JSON.stringify(doc), conditional ? version : null);
    } catch (err) {
      // Kept for the day the condition is turned back on: losing the race is
      // not a failure, it means re-applying on top of the document that won.
      if (err instanceof BlobPreconditionFailedError) throw new ConcurrentWrite();
      throw err;
    }
  }

  /** One put attempt, across whichever access modes are still plausible. */
  private async put(body: string, version: string | null): Promise<void> {
    const modes: Access[] = accessMode ? [accessMode] : ["private", "public"];
    let lastError: unknown;

    for (const access of modes) {
      try {
        await put(statePath(), body, {
          access,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
          cacheControlMaxAge: 0,
          ...(version ? { ifMatch: version } : {}),
          ...blobCredentials(),
        });
        if (accessMode !== access) {
          console.info(`[blob-store] state document stored with access=${access}`);
        }
        accessMode = access;
        return;
      } catch (err) {
        if (err instanceof BlobPreconditionFailedError) throw err;
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not write the state document to Blob storage.");
  }
}

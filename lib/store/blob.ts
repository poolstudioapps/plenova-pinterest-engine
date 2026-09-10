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
 * Conditional writes are used until the store shows it will not take them.
 *
 * `ifMatch` is the right tool here, but it depends on the Blob API accepting
 * it, and a store that rejects it would otherwise fail every single save. So a
 * conditional write that fails for any reason other than losing the race is
 * retried without the condition, and the process stops trying to be
 * conditional. Losing the safety is bad; refusing to save anything is worse.
 */
let conditionalWrites = true;

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
    const body = JSON.stringify(doc);
    const conditional = conditionalWrites && version !== null;

    try {
      await this.put(body, conditional ? version : null);
      return;
    } catch (err) {
      // Losing the race is not a failure: let the caller re-apply on top of
      // the document that won.
      if (err instanceof BlobPreconditionFailedError) throw new ConcurrentWrite();
      if (!conditional) throw err;

      // The condition itself is what the store would not take.
      conditionalWrites = false;
      console.warn(
        "[blob-store] conditional writes refused, falling back to unconditional:",
        err instanceof Error ? err.message : String(err),
      );
      await this.put(body, null);
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

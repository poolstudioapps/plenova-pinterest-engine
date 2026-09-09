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
 */
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
    const modes: Access[] = accessMode ? [accessMode] : ["private", "public"];

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
          return emptyState();
        }
        accessMode = access;
        return { ...emptyState(), ...parsed };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A missing document on first run is expected, as is "wrong access
        // mode" while we are still probing. Anything else deserves a log.
        if (!/not.?found|404|access|forbidden|403/i.test(message)) {
          console.warn("[blob-store] read failed:", message);
        }
      }
    }
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

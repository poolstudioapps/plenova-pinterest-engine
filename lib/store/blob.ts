import "server-only";
import { get, put } from "@vercel/blob";
import { config } from "@/lib/config";
import { DocumentStore } from "./base";
import { emptyState, type StateDocument } from "./types";

/**
 * Production adapter, backed by Vercel Blob.
 *
 * The state document is stored with `access: 'private'` so Pin records and the
 * (already encrypted) OAuth envelope are never reachable over a public URL.
 * Only the generated Pin images are public - Pinterest requires that.
 *
 * Reads use `useCache: false`: the CDN would otherwise serve a stale document
 * straight after a write, which loses Pins.
 */
const STATE_PATH = "engine/state.json";

export class BlobStore extends DocumentStore {
  readonly name = "Vercel Blob";
  readonly persistent = true;

  protected async read(): Promise<StateDocument> {
    try {
      const result = await get(STATE_PATH, {
        access: "private",
        useCache: false,
        token: config.storage.blobToken,
      });
      if (!result?.stream) return emptyState();

      const text = await new Response(result.stream).text();
      const parsed = JSON.parse(text) as StateDocument;
      if (parsed.version !== 1 || typeof parsed.pins !== "object") {
        return emptyState();
      }
      return { ...emptyState(), ...parsed };
    } catch (err) {
      // A missing blob on first run is expected; anything else is worth a log.
      const message = err instanceof Error ? err.message : String(err);
      if (!/not.?found|404/i.test(message)) {
        console.warn("[blob-store] read failed:", message);
      }
      return emptyState();
    }
  }

  protected async write(doc: StateDocument): Promise<void> {
    await put(STATE_PATH, JSON.stringify(doc), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
      token: config.storage.blobToken,
    });
  }
}

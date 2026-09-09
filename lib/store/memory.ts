import "server-only";
import { DocumentStore } from "./base";
import { emptyState, type StateDocument } from "./types";

/**
 * Last-resort adapter. Survives only within a single server process, so it is
 * explicitly marked non-persistent and the dashboard warns about it.
 *
 * The document is held on globalThis so Next.js dev hot-reloads don't wipe it.
 */
const KEY = Symbol.for("plenova.pinterest.memoryState");

interface GlobalWithState {
  [KEY]?: StateDocument;
}

function state(): StateDocument {
  const g = globalThis as GlobalWithState;
  g[KEY] ??= emptyState();
  return g[KEY];
}

export class MemoryStore extends DocumentStore {
  readonly name = "In-memory (development only)";
  readonly persistent = false;

  protected async read(): Promise<StateDocument> {
    return state();
  }

  protected async write(doc: StateDocument): Promise<void> {
    (globalThis as GlobalWithState)[KEY] = doc;
  }
}

import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DocumentStore } from "./base";
import { emptyState, type StateDocument } from "./types";

/**
 * Local development adapter. Writes .data/state.json under the project root.
 *
 * Never used in production: Vercel's filesystem is read-only and ephemeral,
 * which is exactly the "do not depend on a local filesystem" case in spec §16.
 */
const FILE = join(process.cwd(), ".data", "state.json");

export class FileStore extends DocumentStore {
  readonly name = "Local file (.data/state.json)";
  readonly persistent = true;

  protected async read(): Promise<StateDocument> {
    let raw: string;
    try {
      raw = await readFile(FILE, "utf8");
    } catch (err) {
      // Only "the file is not there yet" means an empty state. Every other
      // failure has to surface: callers write back what they read, so
      // answering a permission error with an empty document would erase
      // everything on the next save.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw err;
    }

    const parsed = JSON.parse(raw) as StateDocument;
    if (parsed.version !== 1 || typeof parsed.pins !== "object") {
      throw new Error(
        `${FILE} is not in a shape this version understands. Refusing to overwrite it.`,
      );
    }
    return { ...emptyState(), ...parsed };
  }

  protected async write(doc: StateDocument): Promise<void> {
    await mkdir(dirname(FILE), { recursive: true });
    // Write-then-rename so a crash mid-write cannot truncate the state file.
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
    await rename(tmp, FILE);
  }
}

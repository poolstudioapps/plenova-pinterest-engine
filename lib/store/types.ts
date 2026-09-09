import type { PinRecord, PinStatus, PinterestConnection } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

export interface PinFilter {
  locale?: Locale;
  plantSlug?: string;
  angleSlug?: string;
  status?: PinStatus;
  search?: string;
  limit?: number;
}

/**
 * Storage abstraction (spec §21).
 *
 * The MVP deliberately avoids a database. This interface is the seam that lets
 * a Postgres/Supabase adapter drop in for Phase 4 scheduling without touching
 * a single route handler.
 *
 * Implementations must persist the connection payload ENCRYPTED - see
 * lib/crypto.ts. No adapter ever receives a plaintext token.
 */
export interface EngineStore {
  /** Human-readable adapter name, surfaced on the dashboard. */
  readonly name: string;
  /** False for the in-memory dev adapter, which loses data between requests. */
  readonly persistent: boolean;

  listPins(filter?: PinFilter): Promise<PinRecord[]>;
  getPin(id: string): Promise<PinRecord | null>;
  findByDedupeKey(key: string): Promise<PinRecord | null>;
  /**
   * Titles recorded for a plant in one language - feeds the "don't repeat
   * yourself" prompt. Scoped by locale, since a French title is no constraint
   * on an English one.
   */
  titlesForPlant(plantSlug: string, locale: Locale): Promise<string[]>;
  savePin(pin: PinRecord): Promise<void>;
  deletePin(id: string): Promise<void>;

  getConnection(): Promise<PinterestConnection | null>;
  setConnection(connection: PinterestConnection | null): Promise<void>;
}

/** Shape of the single persisted state document. */
export interface StateDocument {
  version: 1;
  pins: Record<string, PinRecord>;
  /** AES-256-GCM envelope produced by lib/crypto.ts, or null when disconnected. */
  connection: string | null;
}

export function emptyState(): StateDocument {
  return { version: 1, pins: {}, connection: null };
}

/** Shared filter/sort logic so every adapter behaves identically. */
export function applyFilter(
  pins: PinRecord[],
  filter: PinFilter = {},
): PinRecord[] {
  let out = pins;

  if (filter.locale) out = out.filter((p) => p.locale === filter.locale);
  if (filter.plantSlug) out = out.filter((p) => p.plantSlug === filter.plantSlug);
  if (filter.angleSlug) out = out.filter((p) => p.angleSlug === filter.angleSlug);
  if (filter.status) out = out.filter((p) => p.status === filter.status);

  if (filter.search) {
    const q = filter.search.toLowerCase().trim();
    out = out.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.plantName.toLowerCase().includes(q) ||
        p.keywords.some((k) => k.includes(q)),
    );
  }

  out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return filter.limit ? out.slice(0, filter.limit) : out;
}

import "server-only";
import { randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { badRequest, notConfigured, unauthorized } from "@/lib/errors";
import { supabaseService } from "@/lib/store/supabase";
import { config } from "@/lib/config";
import type { SpyAgent, SpyMediaType } from "@/lib/types";

/**
 * The spy agent's side of the app.
 *
 * The spy runs on whatever computer launches it - TikTok answers a home
 * connection and blocks datacenters - and it can be handed to someone else.
 * So it never holds a database key: it holds an agent token, created and
 * revoked in the app, and everything it finds comes through these calls.
 * Only a hash of each token is stored.
 *
 * Supabase only: the offline dev store has no agents.
 */

const BUCKET = "spy";
/**
 * How far back a new post is taken: a competitor's carousels of the last two
 * weeks; anything of ours the profile shows.
 */
export const WINDOW_DAYS = { competitor: 14, ours: 3650 } as const;
/**
 * Which stored posts get their numbers read again: those published in the 7
 * days before the last pass (asked for by the user - older ones hardly move,
 * and each one read costs a TikTok page). Ours for 30: the versus page adds
 * up their views, which keep climbing for weeks.
 */
export const REFRESH_DAYS = { competitor: 7, ours: 30 } as const;
// Sent as base64 in JSON, and a Vercel request stops at 4.5 MB.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/** History fetched per account and per pass - enough for a whole profile in one go. */
const BACKFILL_PER_PASS = 1000;

function db() {
  if (!config.supabase.url || !config.supabase.serviceKey) {
    throw notConfigured("Le spy a besoin de Supabase.");
  }
  return supabaseService();
}

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// ------------------------------------------------------------------ agents

function agentFromRow(row: Record<string, unknown>): SpyAgent {
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    lastHost: (row.last_host as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  };
}

export async function listSpyAgents(): Promise<SpyAgent[]> {
  const { data, error } = await db().from("spy_agents").select("*").order("created_at", { ascending: false });
  check("lecture des postes du spy", error);
  return (data ?? []).map(agentFromRow);
}

/** A new token, shown once: only its hash is kept. */
export async function createSpyAgent(rawName: unknown): Promise<{ agent: SpyAgent; token: string }> {
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 60) : "";
  if (!name) throw badRequest("Donne un nom à ce poste, par exemple « PC du bureau ».");
  const token = `spy_${randomToken(24)}`;
  const row = {
    id: `agt_${randomToken(8)}`,
    name,
    token_hash: sha256(token),
    created_at: new Date().toISOString(),
  };
  const { error } = await db().from("spy_agents").insert(row);
  check("création d'un poste du spy", error);
  return { agent: agentFromRow(row), token };
}

export async function revokeSpyAgent(id: string): Promise<void> {
  const { error } = await db()
    .from("spy_agents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  check("révocation d'un poste du spy", error);
}

/** The agent behind a bearer token, or a 401. Also notes when it was last seen. */
export async function authenticateAgent(request: Request): Promise<SpyAgent> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith("spy_")) throw unauthorized("Code d'accès du spy manquant.");
  const hash = sha256(token);
  const { data, error } = await db().from("spy_agents").select("*").eq("token_hash", hash).maybeSingle();
  check("vérification du code d'accès", error);
  if (!data || data.revoked_at || !safeEqual(String(data.token_hash), hash)) {
    throw unauthorized("Code d'accès du spy refusé : crée-en un nouveau dans l'app, Spy > Comptes.");
  }
  const host = (request.headers.get("x-spy-host") ?? "").slice(0, 80) || null;
  await db()
    .from("spy_agents")
    .update({ last_seen_at: new Date().toISOString(), ...(host ? { last_host: host } : {}) })
    .eq("id", data.id);
  return agentFromRow(data);
}

// -------------------------------------------------------------------- plan

export interface AgentPlanAccount {
  username: string;
  ours: boolean;
  /** New posts are taken this far back. */
  windowDays: number;
  /** Already stored, within that window: never fetched again, unless listed in `known`. */
  stored: string[];
  /** Stored posts recent enough to have their numbers read again. */
  known: string[];
  /** Older posts to fetch once (the account's history), whatever their age. */
  backfill: string[];
  /** Stored with their cover only (history import): their slides are fetched now. */
  complete: string[];
}

/** Every row of a query, past PostgREST's 1000-row pages. */
async function everyRow<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    check(what, error);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

/** What to visit this pass: every enabled account, and what is already known of each. */
export async function agentPlan(): Promise<AgentPlanAccount[]> {
  const { data: accounts, error } = await db()
    .from("spy_accounts")
    .select("username, team")
    .eq("enabled", true)
    .order("username");
  check("lecture des comptes", error);

  const stored = await everyRow<{ id: string; username: string; posted_at: string | null; from_history: boolean }>(
    (from, to) => db().from("spy_posts").select("id, username, posted_at, from_history").order("id").range(from, to),
    "lecture des posts connus",
  );
  // Taken out on purpose (the < 50k views clean): never brought back.
  const removed = await everyRow<{ id: string; username: string }>(
    (from, to) => db().from("spy_removed").select("id, username").order("id").range(from, to),
    "lecture des posts retirés",
  );
  const queued = await everyRow<{ id: string; username: string }>(
    (from, to) => db().from("spy_backfill").select("id, username").order("added_at").range(from, to),
    "lecture de l'historique à récupérer",
  );
  // "The 7 days before the last pass": counted from the last pass that ran,
  // so a spy left off for a while still catches up on the week before.
  const { data: lastRun, error: runError } = await db()
    .from("spy_runs")
    .select("started_at")
    .not("finished_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  check("lecture du dernier passage", runError);
  const anchor = Math.min(Date.now(), lastRun?.started_at ? Date.parse(lastRun.started_at as string) : Date.now());

  // Queued posts already stored (the latest ones, harvested with the rest of
  // the grid) leave the queue now: nothing would ever fetch them again.
  const have = new Set([...stored.map((r) => r.id), ...removed.map((r) => r.id)]);
  const already = queued.filter((q) => have.has(q.id));
  for (const username of new Set(already.map((q) => q.username))) {
    await dropFromBackfill(username, already.filter((q) => q.username === username).map((q) => q.id));
  }
  const pending = queued.filter((q) => !have.has(q.id));

  // Our accounts first: the versus page waits on them, the competitors can wait.
  const ordered = [...(accounts ?? [])].sort((a, b) => Number(!a.team) - Number(!b.team));

  return ordered.map((a) => {
    const username = a.username as string;
    const ours = Boolean(a.team);
    const windowDays = ours ? WINDOW_DAYS.ours : WINDOW_DAYS.competitor;
    const windowFrom = Date.now() - windowDays * 86400_000;
    const refreshFrom = anchor - (ours ? REFRESH_DAYS.ours : REFRESH_DAYS.competitor) * 86400_000;
    const own = stored.filter((r) => r.username === username);
    const at = (r: { posted_at: string | null }) => (r.posted_at ? Date.parse(r.posted_at) : 0);
    return {
      username,
      ours,
      windowDays,
      stored: [
        ...own.filter((r) => at(r) >= windowFrom).map((r) => r.id),
        ...removed.filter((r) => r.username === username).map((r) => r.id),
      ],
      known: own.filter((r) => at(r) >= refreshFrom).map((r) => r.id),
      backfill: pending
        .filter((q) => q.username === username)
        .slice(0, BACKFILL_PER_PASS)
        .map((q) => q.id),
      complete: ours
        ? []
        : own
            .filter((r) => r.from_history)
            .slice(0, BACKFILL_PER_PASS)
            .map((r) => r.id),
    };
  });
}

/** Takes posts out of the history queue: stored, or gone from TikTok. */
async function dropFromBackfill(username: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db().from("spy_backfill").delete().eq("username", username).in("id", ids);
  check("mise à jour de l'historique à récupérer", error);
}

// -------------------------------------------------------------------- runs

export async function startAgentRun(agentId: string, accounts: number, host: string | null): Promise<string> {
  const { data, error } = await db()
    .from("spy_runs")
    .insert({ accounts, host, agent_id: agentId })
    .select("id")
    .single();
  check("début du passage", error);
  if (!data) throw new Error("début du passage : aucune ligne créée");
  return String(data.id);
}

/** Closes a pass - only the computer that opened it, and only once. */
export async function finishAgentRun(
  agentId: string,
  id: string,
  result: { found: number; added: number; errors: { username: string; message: string }[] },
): Promise<void> {
  const { data, error } = await db()
    .from("spy_runs")
    .update({
      finished_at: new Date().toISOString(),
      found: result.found,
      added: result.added,
      errors: result.errors.slice(0, 100),
    })
    .eq("id", id)
    .eq("agent_id", agentId)
    .is("finished_at", null)
    .select("id");
  check("fin du passage", error);
  if (!data || data.length === 0) throw badRequest("Passage inconnu, d'un autre ordinateur, ou déjà terminé.");
}

// ------------------------------------------------------------------ images

/** "@chlo_prt4/7688…/01.jpg" - only what the agent may write. */
const IMAGE_PATH = /^(avatars\/[a-z0-9._]{2,24}|[a-z0-9._]{2,24}\/\d{5,25}\/(\d{2}|cover))\.(jpg|webp|png)$/;

/** What the bytes are, from their first few - whatever the sender declared. */
function sniffImage(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * Stores one picture the agent copied from TikTok, and answers with its public
 * address. A post's pictures are written once: a second copy of the same
 * slide is taken as already there, so no computer can swap a stored slide.
 * Only avatars are replaced, since they change.
 */
export async function storeAgentImage(path: unknown, dataBase64: unknown): Promise<string> {
  if (typeof path !== "string" || !IMAGE_PATH.test(path)) throw badRequest("Chemin d'image invalide.");
  if (typeof dataBase64 !== "string" || !dataBase64) throw badRequest("Image vide.");
  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw badRequest("Image vide ou trop lourde.");
  const type = sniffImage(bytes);
  if (!type) throw badRequest("Ce fichier n'est pas une image JPEG, PNG ou WebP.");
  const avatar = path.startsWith("avatars/");
  const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: avatar });
  const exists = error && (String((error as { statusCode?: unknown }).statusCode) === "409" || /already exists|duplicate/i.test(error.message));
  if (!exists) check(`envoi de ${path}`, error);
  return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ------------------------------------------------------------------- posts

export interface AgentPost {
  id: string;
  username: string;
  mediaType: SpyMediaType;
  caption: string;
  postedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  /** Only for a post new to the app: its pictures, already stored. */
  images?: { url: string; width?: number; height?: number }[];
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

/** Creates a post the app has never seen, or refreshes the numbers of one it has. */
export async function recordAgentPost(raw: unknown): Promise<{ created: boolean }> {
  const p = (raw ?? {}) as Record<string, unknown>;
  const id = typeof p.id === "string" && /^\d{5,25}$/.test(p.id) ? p.id : "";
  const username = typeof p.username === "string" && /^[a-z0-9._]{2,24}$/.test(p.username) ? p.username : "";
  if (!id || !username) throw badRequest("Post invalide.");
  // Only the accounts the app follows.
  const { data: account, error: accountError } = await db()
    .from("spy_accounts")
    .select("username, team")
    .eq("username", username)
    .maybeSingle();
  check("lecture du compte", accountError);
  if (!account) throw badRequest(`@${username} n'est pas suivi par le spy.`);
  const stats = {
    views: count(p.views),
    likes: count(p.likes),
    comments: count(p.comments),
    shares: count(p.shares),
    saves: count(p.saves),
    stats_updated_at: new Date().toISOString(),
  };

  const { data: existing, error: readError } = await db().from("spy_posts").select("id").eq("id", id).maybeSingle();
  check("lecture d'un post", readError);
  // Only pictures this app stored itself, for this very post.
  const own = `${db().storage.from(BUCKET).getPublicUrl("").data.publicUrl.replace(/\/+$/, "")}/${username}/${id}/`;
  const images = (Array.isArray(p.images) ? p.images : [])
    .map((i) => (i ?? {}) as Record<string, unknown>)
    .filter((i) => typeof i.url === "string" && i.url.startsWith(own) && !i.url.includes(".."))
    .slice(0, 35)
    .map((i) => ({
      url: i.url as string,
      ...(Number(i.width) > 0 ? { width: Number(i.width) } : {}),
      ...(Number(i.height) > 0 ? { height: Number(i.height) } : {}),
    }));
  if (existing) {
    // A history import brought in with its cover only: its slides arrive now.
    const completing = p.complete === true && images.length > 0 && !account.team;
    const { error } = await db()
      .from("spy_posts")
      .update({ ...stats, ...(completing ? { images, from_history: false } : {}) })
      .eq("id", id)
      .eq("username", username);
    check("mise à jour des chiffres", error);
    await dropFromBackfill(username, [id]);
    return { created: false };
  }

  if (images.length === 0) throw badRequest("Un nouveau post arrive avec ses images.");
  const mediaType: SpyMediaType = p.mediaType === "video" ? "video" : "carousel";
  const postedAt = typeof p.postedAt === "string" && !Number.isNaN(Date.parse(p.postedAt)) ? p.postedAt : null;
  // A competitor's old carousel from the history import: cover and numbers only.
  const fromHistory =
    p.history === true &&
    !account.team &&
    postedAt !== null &&
    Date.parse(postedAt) < Date.now() - WINDOW_DAYS.competitor * 86400_000;

  const { error } = await db().from("spy_posts").insert({
    id,
    username,
    media_type: mediaType,
    url: `https://www.tiktok.com/@${username}/${mediaType === "video" ? "video" : "photo"}/${id}`,
    caption: typeof p.caption === "string" ? p.caption.slice(0, 2200) : "",
    posted_at: postedAt,
    images,
    from_history: fromHistory,
    ...stats,
    // Our own videos never go through the hook reader.
    ...(mediaType === "video" ? { hook_checked_at: new Date().toISOString(), hook_text: "" } : {}),
  });
  // Sent twice at once (two computers): the second simply finds it there.
  if (error && /duplicate key/i.test(error.message)) return { created: false };
  check("enregistrement d'un post", error);
  await dropFromBackfill(username, [id]);
  return { created: true };
}

// ---------------------------------------------------------------- accounts

/** What a pass learned about one account: its profile, and how the visit went. */
export async function recordAgentAccount(raw: unknown): Promise<void> {
  const a = (raw ?? {}) as Record<string, unknown>;
  const username = typeof a.username === "string" && /^[a-z0-9._]{2,24}$/.test(a.username) ? a.username : "";
  if (!username) throw badRequest("Compte invalide.");
  const status = a.status === "ok" || a.status === "empty" || a.status === "error" ? a.status : "error";
  const followers = Number(a.followers) > 0 ? Math.round(Number(a.followers)) : null;
  const likesTotal = Number(a.likesTotal) > 0 ? Math.round(Number(a.likesTotal)) : null;
  const avatarPath = `${db().storage.from(BUCKET).getPublicUrl("").data.publicUrl.replace(/\/+$/, "")}/avatars/${username}.`;
  const avatar =
    typeof a.avatarUrl === "string" && a.avatarUrl.startsWith(avatarPath) && !a.avatarUrl.includes("..") ? a.avatarUrl : null;
  const now = new Date();

  const { error } = await db()
    .from("spy_accounts")
    .update({
      last_checked_at: now.toISOString(),
      last_status: status,
      last_error: typeof a.error === "string" && a.error ? a.error.slice(0, 300) : null,
      last_found: count(a.found),
      ...(typeof a.displayName === "string" && a.displayName ? { display_name: a.displayName.slice(0, 80) } : {}),
      ...(avatar ? { avatar_url: avatar } : {}),
      ...(followers ? { followers } : {}),
      ...(likesTotal ? { likes_total: likesTotal } : {}),
    })
    .eq("username", username);
  check("mise à jour du compte", error);

  // One line a day, so the growth of each account can be told.
  if (followers || likesTotal) {
    const { error: statsError } = await db()
      .from("spy_account_stats")
      .upsert({
        username,
        day: now.toISOString().slice(0, 10),
        ...(followers ? { followers } : {}),
        ...(likesTotal ? { likes_total: likesTotal } : {}),
      });
    check("historique du compte", statsError);
  }

  // History posts TikTok no longer shows (deleted, made private): not asked for again.
  const gone = (Array.isArray(a.gone) ? a.gone : []).filter((id): id is string => typeof id === "string" && /^\d{5,25}$/.test(id));
  await dropFromBackfill(username, gone.slice(0, 500));
}

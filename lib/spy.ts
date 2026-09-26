import "server-only";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { ContentLocale } from "@/lib/i18n";
import type { OverlayStyle } from "@/lib/overlay";
import { runRepost, startRepost, type RepostImageMode } from "@/lib/repost-carousel";
import { getStore } from "@/lib/store";
import type { CarouselRecord, SpyAccount, SpyPost, SpyRun, Team } from "@/lib/types";

/**
 * The spy, app side.
 *
 * The scraping itself runs on ordinary computers (the "Plenova Spy" folder,
 * scripts/spy-agent.mjs), which report through /api/spy/agent: TikTok blocks
 * datacenters, and scraping from this app - the one registered with TikTok for
 * publishing - would put that registration at risk. What lives here is what
 * the operator decides: which accounts to watch, what to rebuild, what to set
 * aside.
 *
 * Two kinds of accounts share the list. Competitors (no team) feed the Spy
 * page. Ours (team Mr Stark or Mr Mousk) are only measured, on the Versus page,
 * and never show on the Spy page - asked for by the user.
 */

/** "@Lea.Moreau06", "tiktok.com/@lea.moreau06/photo/…" -> "lea.moreau06". */
export function normaliseUsername(raw: unknown): string {
  const input = typeof raw === "string" ? raw.trim() : "";
  const fromUrl = input.match(/tiktok\.com\/@([^/?#\s]+)/i)?.[1];
  const username = (fromUrl ?? input).replace(/^@+/, "").trim().toLowerCase();
  if (!/^[a-z0-9._]{2,24}$/.test(username)) {
    throw badRequest("Ce n'est pas un nom de compte TikTok : colle @compte ou le lien du profil.");
  }
  return username;
}

export interface SpyOverview {
  accounts: SpyAccount[];
  posts: SpyPost[];
  run: SpyRun | null;
}

/** Asked of someone who has no team yet (address without one, no choice made). */
const NO_TEAM = "Choisis d'abord pour quelle équipe tu traites, en haut de la page Spy.";

/** A post as one team sees it: that team's status on top, both teams' in `teams`. */
export function forTeam(post: SpyPost, team: Team | null): SpyPost {
  const state = team ? post.teams[team] : { status: "new" as const, carouselId: null, handledAt: null };
  return { ...post, ...state };
}

/**
 * The spy page's data: competitors only. Our own accounts, their posts and
 * their errors belong to the versus page, where they are measured.
 */
export async function spyOverview(team: Team | null): Promise<SpyOverview> {
  const store = getStore();
  const [accounts, posts, run] = await Promise.all([
    store.listSpyAccounts(),
    store.listSpyPosts(),
    store.latestSpyRun(),
  ]);
  const ours = new Set(accounts.filter((a) => a.team).map((a) => a.username));
  const competitors = new Set(accounts.filter((a) => !a.team).map((a) => a.username));
  return {
    accounts: accounts.filter((a) => !a.team),
    // Every competitor carousel, history imports included (their slides are
    // fetched on the next pass; until then they cannot be rebuilt).
    posts: posts
      .filter((p) => p.mediaType === "carousel" && !p.removed && !ours.has(p.username))
      .map((p) => forTeam(p, team)),
    // Only what is still worth a look here: followed competitors, or the pass itself ("*").
    run: run ? { ...run, errors: run.errors.filter((e) => e.username === "*" || competitors.has(e.username)) } : null,
  };
}

function cleanTeam(raw: unknown): SpyAccount["team"] {
  return raw === "stark" || raw === "mousk" ? raw : null;
}

export async function addSpyAccount(raw: unknown, team?: unknown): Promise<SpyAccount> {
  const username = normaliseUsername(raw);
  const store = getStore();
  const accounts = await store.listSpyAccounts();
  if (accounts.some((a) => a.username === username)) {
    throw conflict(`@${username} est déjà dans la liste.`);
  }
  const account: SpyAccount = {
    username,
    enabled: true,
    team: cleanTeam(team),
    likesTotal: null,
    note: null,
    displayName: null,
    avatarUrl: null,
    followers: null,
    addedAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastStatus: null,
    lastError: null,
    lastFound: null,
  };
  await store.saveSpyAccount(account);
  return account;
}

export async function updateSpyAccount(
  username: string,
  patch: { enabled?: unknown; note?: unknown; team?: unknown },
): Promise<SpyAccount> {
  const store = getStore();
  const account = (await store.listSpyAccounts()).find((a) => a.username === username);
  if (!account) throw notFound(`@${username} n'est plus dans la liste.`);
  if (patch.team !== undefined && (account.team === null) !== (cleanTeam(patch.team) === null)) {
    throw badRequest("Un concurrent ne devient pas un de nos comptes (ni l'inverse) : retire-le puis ajoute-le au bon endroit.");
  }
  // Only what was asked: a note and a pause sent a split second apart both stay.
  const fields: Partial<Pick<SpyAccount, "enabled" | "note" | "team">> = {
    ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
    ...(patch.team !== undefined ? { team: cleanTeam(patch.team) } : {}),
    ...(patch.note !== undefined
      ? { note: typeof patch.note === "string" && patch.note.trim() ? patch.note.trim().slice(0, 200) : null }
      : {}),
  };
  if (Object.keys(fields).length > 0) await store.updateSpyAccountFields(username, fields);
  return { ...account, ...fields };
}

/**
 * Stops following an account. A competitor's carousels stay (what was handled
 * keeps its history). One of ours takes its posts with it: kept, they would
 * turn up among the competitors' carousels to rebuild.
 */
export async function removeSpyAccount(username: string): Promise<void> {
  const store = getStore();
  const account = (await store.listSpyAccounts()).find((a) => a.username === username);
  await store.deleteSpyAccount(username);
  if (account?.team) await store.deleteSpyPostsOf(username);
}

/** Sets a carousel aside for one team, or brings it back to that team's list. */
export async function setSpyPostHandled(id: string, status: unknown, team: Team | null): Promise<SpyPost> {
  if (status !== "dismissed" && status !== "new") {
    throw badRequest("Statut inconnu pour ce carrousel.");
  }
  if (!team) throw badRequest(NO_TEAM);
  const store = getStore();
  const post = await store.getSpyPost(id);
  if (!post) throw notFound("Ce carrousel n'est plus dans le spy.");
  await store.setSpyPostState(id, team, status, status === "new" ? null : post.teams[team].carouselId);
  return forTeam((await store.getSpyPost(id)) ?? post, team);
}

/**
 * Deletes a competitor's carousel from the Spy page for good (asked for by the
 * user, to spare the storage): its pictures go, its id stays noted so the spy
 * never brings it back. The hooks read from it stay in the Hooks tab with
 * their numbers - only the pictures are gone.
 */
export async function removeSpyPost(id: string): Promise<void> {
  const store = getStore();
  const post = await store.getSpyPost(id);
  if (!post) throw notFound("Ce carrousel n'est plus dans le spy.");
  const owner = (await store.listSpyAccounts()).find((a) => a.username === post.username);
  if (owner?.team) throw badRequest("Ce post vient d'un de nos comptes : il se gère sur la page Versus.");
  await store.removeSpyPost(id, "supprimé à la main");
}

export interface ProcessSpyInput {
  languages: ContentLocale[];
  imageMode: RepostImageMode;
  overlayStyle?: OverlayStyle;
}

/**
 * Rebuilds a spied carousel as one of ours, through the repost pipeline: each
 * slide read, its picture cleaned or remade, its words rewritten in our voice
 * and languages.
 *
 * The post is marked processed as soon as the job exists, so it leaves the
 * list at once; the carousel it points to carries any failure, and the post
 * can be put back from "Déjà traités".
 */
export async function startSpyProcessing(
  id: string,
  input: ProcessSpyInput,
  team: Team | null,
): Promise<{ carousel: CarouselRecord; run: () => Promise<void> }> {
  if (!team) throw badRequest(NO_TEAM);
  const store = getStore();
  const post = await store.getSpyPost(id);
  if (!post) throw notFound("Ce carrousel n'est plus dans le spy.");
  if (post.mediaType !== "carousel") throw badRequest("C'est une vidéo : seuls les carrousels se refont.");
  if (post.removed) throw badRequest("Ce carrousel a été supprimé du Spy : ses images ne sont plus gardées.");
  if (post.fromHistory) {
    throw badRequest("Carrousel ancien, importé avec l'historique : seule sa couverture est gardée, il ne se refait pas.");
  }
  const owner = (await store.listSpyAccounts()).find((a) => a.username === post.username);
  if (owner?.team) throw badRequest("Ce post vient d'un de nos comptes : il n'est pas à refaire.");
  if (post.images.length === 0) throw badRequest("Ce carrousel n'a aucune image enregistrée.");
  // Twice would make two carousels of it, and lose track of the first.
  if (post.teams[team].status === "processed") {
    throw conflict("Ce carrousel est déjà traité. Remets-le à traiter dans le Spy pour le refaire.");
  }

  const repost = {
    frames: post.images.map((image) => image.url),
    languages: input.languages,
    imageMode: input.imageMode,
    spyPostId: post.id,
    ...(input.overlayStyle ? { overlayStyle: input.overlayStyle } : {}),
  };
  const carousel = await startRepost(repost);
  try {
    await store.setSpyPostState(post.id, team, "processed", carousel.id);
  } catch (err) {
    // Not recorded as processed: no job either, rather than one nobody can find.
    await store.deleteCarousel(carousel.id).catch(() => undefined);
    throw err;
  }
  return { carousel, run: () => runRepost(carousel.id, repost) };
}

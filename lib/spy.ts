import "server-only";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { ContentLocale } from "@/lib/i18n";
import type { OverlayStyle } from "@/lib/overlay";
import { runRepost, startRepost, type RepostImageMode } from "@/lib/repost-carousel";
import { getStore } from "@/lib/store";
import type { CarouselRecord, SpyAccount, SpyPost, SpyRun } from "@/lib/types";

/**
 * The spy, app side.
 *
 * The scraping itself runs on the operator's computer (scripts/tiktok-spy.mjs)
 * and writes straight into Supabase: TikTok only hands its carousels to a real
 * browser, and scraping from this app - the one registered with TikTok for
 * publishing - would put that registration at risk. What lives here is what
 * the operator decides: which accounts to watch, what to rebuild, what to set
 * aside.
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

export async function spyOverview(): Promise<SpyOverview> {
  const store = getStore();
  const [accounts, posts, run] = await Promise.all([
    store.listSpyAccounts(),
    store.listSpyPosts(),
    store.latestSpyRun(),
  ]);
  return { accounts, posts, run };
}

export async function addSpyAccount(raw: unknown): Promise<SpyAccount> {
  const username = normaliseUsername(raw);
  const store = getStore();
  const accounts = await store.listSpyAccounts();
  if (accounts.some((a) => a.username === username)) {
    throw conflict(`@${username} est déjà dans la liste.`);
  }
  const account: SpyAccount = {
    username,
    enabled: true,
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
  patch: { enabled?: unknown; note?: unknown },
): Promise<SpyAccount> {
  const store = getStore();
  const account = (await store.listSpyAccounts()).find((a) => a.username === username);
  if (!account) throw notFound(`@${username} n'est plus dans la liste.`);
  const next: SpyAccount = {
    ...account,
    ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
    ...(patch.note !== undefined
      ? { note: typeof patch.note === "string" && patch.note.trim() ? patch.note.trim().slice(0, 200) : null }
      : {}),
  };
  await store.saveSpyAccount(next);
  return next;
}

export async function removeSpyAccount(username: string): Promise<void> {
  await getStore().deleteSpyAccount(username);
}

/** Sets a carousel aside, or brings it back to the ones to look at. */
export async function setSpyPostHandled(id: string, status: unknown): Promise<SpyPost> {
  if (status !== "dismissed" && status !== "new") {
    throw badRequest("Statut inconnu pour ce carrousel.");
  }
  const store = getStore();
  const post = await store.getSpyPost(id);
  if (!post) throw notFound("Ce carrousel n'est plus dans le spy.");
  await store.setSpyPostStatus(id, status, status === "new" ? null : post.carouselId);
  return (await store.getSpyPost(id)) ?? post;
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
): Promise<{ carousel: CarouselRecord; run: () => Promise<void> }> {
  const store = getStore();
  const post = await store.getSpyPost(id);
  if (!post) throw notFound("Ce carrousel n'est plus dans le spy.");
  if (post.images.length === 0) throw badRequest("Ce carrousel n'a aucune image enregistrée.");
  // Twice would make two carousels of it, and lose track of the first.
  if (post.status === "processed") {
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
    await store.setSpyPostStatus(post.id, "processed", carousel.id);
  } catch (err) {
    // Not recorded as processed: no job either, rather than one nobody can find.
    await store.deleteCarousel(carousel.id).catch(() => undefined);
    throw err;
  }
  return { carousel, run: () => runRepost(carousel.id, repost) };
}

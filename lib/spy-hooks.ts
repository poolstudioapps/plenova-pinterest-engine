import "server-only";
import { randomToken } from "@/lib/crypto";
import { readSpiedHook } from "@/lib/gemini";
import { HOOK_MAX_LENGTH, hookKey, sameHook } from "@/lib/hook-key";
import { plantVetoes } from "@/lib/hooks";
import { getStore } from "@/lib/store";
import type { Hook, SpyPost } from "@/lib/types";

/**
 * Hooks from the spy: the cover line of every carousel the watched accounts
 * posted, read once, and filed in the hook bank as an idea - in French, in our
 * voice - with the post it came from as evidence. That evidence is what ranks
 * the bank: a hook is worth what its carousel did.
 *
 * Runs after each spy pass (POST /api/spy/agent/runs/[id], once the pass is
 * closed) and on demand from the hooks page (POST /api/spy/hooks). Only posts never read are sent to Gemini, so a day with
 * nothing new costs nothing.
 *
 * Two passes, or a pass and the hooks page, can run this at the same moment, so each post is
 * claimed in the database before it is read, and a post is marked read only
 * once its idea is safely filed - a failure anywhere gives it back for the
 * next run.
 */

export interface SpyHookRun {
  read: number;
  filed: number;
  failed: number;
  /** Still unread after this run - more than the limit, or failures to retry. */
  left: number;
}

const PARALLEL = 4;

/**
 * Covers worth reading: competitors' carousels not read yet. Our own accounts
 * are measured, not mined for ideas.
 */
export async function unreadSpyPosts(): Promise<SpyPost[]> {
  const store = getStore();
  const [posts, accounts] = await Promise.all([store.listSpyPosts(), store.listSpyAccounts()]);
  const ours = new Set(accounts.filter((a) => a.team).map((a) => a.username));
  return posts.filter(
    (p) => !p.hookCheckedAt && p.images.length > 0 && p.mediaType === "carousel" && !ours.has(p.username),
  );
}

export async function countUnreadSpyHooks(): Promise<number> {
  return (await unreadSpyPosts()).length;
}

export async function analyzeSpyHooks(
  options: { limit?: number; log?: (message: string) => void } = {},
): Promise<SpyHookRun> {
  const store = getStore();
  const log = options.log ?? (() => {});
  const [posts, unread] = await Promise.all([store.listSpyPosts(), unreadSpyPosts()]);
  const todo = unread.slice(0, options.limit ?? unread.length);
  const views = new Map(posts.map((p) => [p.id, p.views]));
  const vetoes = plantVetoes();

  // The whole bank, kept current as hooks are filed, so near-copies collide
  // within the run too. Exact copies are also checked in the database itself.
  const bank = await store.listHooks();
  let filing: Promise<unknown> = Promise.resolve();
  let read = 0;
  let filed = 0;
  let failed = 0;

  async function one(post: SpyPost) {
    if (!(await store.claimSpyPostHook(post.id))) return; // read elsewhere, or being read
    try {
      const res = await fetch(post.images[0]!.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`couverture introuvable (${res.status})`);
      const cover = {
        data: Buffer.from(await res.arrayBuffer()),
        mimeType: res.headers.get("content-type") ?? "image/jpeg",
      };
      const hook = await readSpiedHook(cover, post.caption);
      if (hook.hookFr) {
        // One at a time: two posts can bring the same idea in the same run.
        // A failed filing must not poison the ones queued after it.
        const mine = filing.catch(() => undefined).then(() => fileSpyHook(hook.hookFr, post.id, bank, views, vetoes));
        filing = mine;
        if (await mine) filed += 1;
      }
      // Last: until here a failure leaves the post unread, to be tried again.
      await store.setSpyPostHook(post.id, {
        text: hook.hook,
        lang: hook.lang || null,
        format: hook.hook ? hook.format : null,
        // The idea as the bank holds it, if the post already had one.
        fr: bank.find((h) => h.spyPostId === post.id)?.text ?? (hook.hookFr || null),
      });
      read += 1;
    } catch (err) {
      failed += 1;
      await store.releaseSpyPostHook(post.id).catch(() => undefined);
      log(`  hook de ${post.id} (@${post.username}) : ${err instanceof Error ? err.message : err}`);
    }
  }

  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(todo.slice(i, i + PARALLEL).map(one));
  }
  return { read, filed, failed, left: unread.length - read };
}

/**
 * Files one spied hook, or strengthens the one already there.
 *
 * A hook of ours - typed, suggested, used - is never taken over. A spied idea
 * that says the same thing keeps whichever post did better, so the bank
 * always shows the strongest evidence for an idea. True when a new hook was
 * created.
 */
async function fileSpyHook(
  textFr: string,
  postId: string,
  bank: Hook[],
  views: Map<string, number>,
  vetoes: ReadonlySet<string>,
): Promise<boolean> {
  const store = getStore();
  const text = textFr.slice(0, HOOK_MAX_LENGTH);
  const key = hookKey(text);
  const now = new Date().toISOString();
  // Re-read now: the post may have been processed since the run started.
  const post = await store.getSpyPost(postId);
  if (!post) return false;
  // One idea per post: read again, a cover can come back worded differently,
  // and a second hook would show the same post twice in the tier list.
  if (bank.some((h) => h.spyPostId === post.id)) return false;

  const twin = (await store.findHookByKey(key)) ?? bank.find((h) => sameHook(h.text, text, vetoes));
  if (twin) {
    if (twin.spyPostId === post.id) return false;
    // Only a spied idea still waiting moves to better evidence; ours stays ours.
    if (twin.source !== "spy" || twin.status !== "idea") return false;
    const twinViews = twin.spyPostId
      ? (views.get(twin.spyPostId) ?? (await store.getSpyPost(twin.spyPostId))?.views ?? 0)
      : 0;
    if (twinViews >= post.views) return false;
    const stronger: Hook = { ...twin, spyPostId: post.id, updatedAt: now };
    await store.saveHook(stronger);
    const at = bank.findIndex((h) => h.id === twin.id);
    if (at >= 0) bank[at] = stronger;
    return false;
  }

  // Used only if the post was rebuilt and its carousel is still there.
  const carousel = post.status === "processed" && post.carouselId ? await store.getCarousel(post.carouselId) : null;
  const used = Boolean(carousel && carousel.status !== "failed");
  const hook: Hook = {
    id: `hk_${randomToken(9)}`,
    text,
    key,
    status: used ? "used" : "idea",
    source: "spy",
    carouselId: used ? post.carouselId : null,
    spyPostId: post.id,
    createdAt: now,
    updatedAt: now,
    usedAt: used ? (post.handledAt ?? now) : null,
  };
  await store.saveHook(hook);
  bank.push(hook);
  return true;
}

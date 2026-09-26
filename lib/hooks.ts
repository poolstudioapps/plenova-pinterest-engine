import "server-only";
import { randomToken } from "@/lib/crypto";
import { PLANTS, getPlant } from "@/lib/data/plants";
import { PLANTS_FR } from "@/lib/data/plants.fr";
import { plantName as localizedPlantName } from "@/lib/data/localize";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { generateHookIdeas } from "@/lib/gemini";
import { HOOK_MAX_LENGTH, hookKey, sameHook } from "@/lib/hook-key";
import { getStore } from "@/lib/store";
import type { Hook, HookSource, HookStatus, HookView, SpyPost, Team } from "@/lib/types";

/**
 * The hook bank: every cover line already used, kept as an idea, or seen on a
 * spied account.
 *
 * It exists for one reason - the next suggestions must not be these again -
 * and grows by itself: a carousel records its hook when it starts, a spied
 * carousel records the one it was rebuilt with.
 */

/** Too common in plant names to make two hooks different on their own. */
const GENERIC = new Set(
  "plante plantes plant plants fleur fleurs feuille feuilles arbre commun commune grande petite variegata"
    .split(" "),
);
let vetoCache: Set<string> | null = null;

/**
 * Every word of every plant name the catalog knows - botanical, English,
 * French. Two hooks that differ by one of these are about two plants, so the
 * near-copy rule never merges them.
 */
export function plantVetoes(): ReadonlySet<string> {
  if (vetoCache) return vetoCache;
  const names = PLANTS.flatMap((p) => [
    p.name,
    p.scientificName ?? "",
    PLANTS_FR[p.slug]?.name ?? "",
    ...(PLANTS_FR[p.slug]?.aka ?? []),
  ]);
  vetoCache = new Set(
    names
      .flatMap((n) => hookKey(n).split(" "))
      .filter((w) => w.length > 3 && !GENERIC.has(w)),
  );
  return vetoCache;
}

function cleanText(raw: unknown): string {
  const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (text.length < 3) throw badRequest("Écris le hook, au moins quelques mots.");
  return text.slice(0, HOOK_MAX_LENGTH);
}

export async function listHooks(): Promise<Hook[]> {
  return getStore().listHooks();
}

/**
 * The bank with its evidence: each spied hook carries the numbers of the post
 * it came from - fresh every day, since the spy refreshes them - and how that
 * post did against its own account's usual views.
 */
export async function listHookViews(team: Team | null = null): Promise<{ hooks: HookView[]; unread: number }> {
  const store = getStore();
  const [hooks, posts, accounts] = await Promise.all([
    store.listHooks(),
    store.listSpyPosts(),
    store.listSpyAccounts(),
  ]);
  const byId = new Map(posts.map((p) => [p.id, p]));
  // Our own accounts are measured on the versus page, never ranked here.
  const ours = new Set(accounts.filter((a) => a.team).map((a) => a.username));

  const perAccount = new Map<string, number[]>();
  for (const post of posts) {
    const list = perAccount.get(post.username) ?? [];
    list.push(post.views);
    perAccount.set(post.username, list);
  }
  const medians = new Map([...perAccount].map(([name, views]) => [name, median(views)]));

  const views: HookView[] = hooks.map((hook) => {
    const found: SpyPost | undefined = hook.spyPostId ? byId.get(hook.spyPostId) : undefined;
    const post = found && !ours.has(found.username) ? found : undefined;
    return {
      ...hook,
      spy: post
        ? {
            postId: post.id,
            username: post.username,
            url: post.url,
            postedAt: post.postedAt,
            views: post.views,
            likes: post.likes,
            comments: post.comments,
            shares: post.shares,
            saves: post.saves,
            images: post.images,
            original: post.hookText ?? "",
            lang: post.hookLang,
            format: post.hookFormat,
            accountMedian: medians.get(post.username) ?? null,
            // Where the viewing team stands with that post.
            postStatus: team ? post.teams[team].status : "new",
            fromHistory: Boolean(post.fromHistory),
          }
        : null,
    };
  });
  const unread = posts.filter(
    (p) => !p.hookCheckedAt && p.images.length > 0 && p.mediaType === "carousel" && !ours.has(p.username),
  ).length;
  return { hooks: views, unread };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * A spied carousel was rebuilt: its hook idea is used now - found by the post
 * it points to, or by the idea read from that post's cover, since a better
 * post saying the same thing may have taken the idea over since.
 */
export async function markSpyHooksUsed(spyPostId: string, carouselId: string): Promise<void> {
  try {
    const store = getStore();
    const now = new Date().toISOString();
    const post = await store.getSpyPost(spyPostId);
    const vetoes = plantVetoes();
    const linked = (await store.listHooks()).filter(
      (h) =>
        h.status !== "used" &&
        (h.spyPostId === spyPostId ||
          (h.source === "spy" && Boolean(post?.hookFr) && sameHook(h.text, post!.hookFr!, vetoes))),
    );
    for (const hook of linked) {
      await store.saveHook({ ...hook, status: "used", usedAt: now, carouselId, updatedAt: now });
    }
  } catch (err) {
    console.error("[hooks] could not mark a spied hook used:", err);
  }
}

/** Adds a hook, or hands back the one already holding that text. */
export async function createHook(
  raw: unknown,
  source: HookSource = "manual",
  status: HookStatus = "idea",
): Promise<{ hook: Hook; existed: boolean }> {
  const text = cleanText(raw);
  const key = hookKey(text);
  const store = getStore();
  const existing = await store.findHookByKey(key);
  if (existing) return { hook: existing, existed: true };

  const now = new Date().toISOString();
  const hook: Hook = {
    id: `hk_${randomToken(9)}`,
    text,
    key,
    status,
    source,
    carouselId: null,
    spyPostId: null,
    createdAt: now,
    updatedAt: now,
    usedAt: status === "used" ? now : null,
  };
  await store.saveHook(hook);
  return { hook, existed: false };
}

export async function updateHook(
  id: string,
  patch: { text?: unknown; status?: unknown },
): Promise<Hook> {
  const store = getStore();
  const hook = await store.getHook(id);
  if (!hook) throw notFound("Ce hook n'existe plus.");

  const next: Hook = { ...hook, updatedAt: new Date().toISOString() };
  if (patch.text !== undefined) {
    next.text = cleanText(patch.text);
    next.key = hookKey(next.text);
    if (next.key !== hook.key) {
      const clash = await store.findHookByKey(next.key);
      if (clash && clash.id !== id) throw conflict("Ce hook est déjà dans la liste.");
    }
  }
  if (patch.status === "idea" || patch.status === "used") {
    next.status = patch.status;
    next.usedAt = patch.status === "used" ? (hook.usedAt ?? next.updatedAt) : null;
  }
  await store.saveHook(next);
  return next;
}

export async function deleteHook(id: string): Promise<void> {
  await getStore().deleteHook(id);
}

/**
 * Marks a hook as used - creating it if it was typed straight into the form.
 * A reworded version of an idea in the bank marks that idea used too, so it
 * is not offered again under its old wording. Never fails the caller: a
 * carousel does not stop because its hook could not be filed.
 */
export async function recordHookUsed(
  text: string,
  origin: { source: HookSource; carouselId?: string; spyPostId?: string },
): Promise<void> {
  try {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, HOOK_MAX_LENGTH);
    if (clean.length < 3) return;
    const store = getStore();
    const now = new Date().toISOString();
    const key = hookKey(clean);
    const existing = await store.findHookByKey(key);
    if (!existing) {
      const vetoes = plantVetoes();
      const idea = (await store.listHooks()).find(
        (h) => h.status === "idea" && sameHook(h.text, clean, vetoes),
      );
      if (idea) {
        await store.saveHook({
          ...idea,
          status: "used",
          usedAt: now,
          carouselId: idea.carouselId ?? origin.carouselId ?? null,
          updatedAt: now,
        });
      }
    }
    await store.saveHook(
      existing
        ? {
            ...existing,
            status: "used",
            usedAt: existing.usedAt ?? now,
            carouselId: existing.carouselId ?? origin.carouselId ?? null,
            spyPostId: existing.spyPostId ?? origin.spyPostId ?? null,
            updatedAt: now,
          }
        : {
            id: `hk_${randomToken(9)}`,
            text: clean,
            key,
            status: "used",
            source: origin.source,
            carouselId: origin.carouselId ?? null,
            spyPostId: origin.spyPostId ?? null,
            createdAt: now,
            updatedAt: now,
            usedAt: now,
          },
    );
  } catch (err) {
    console.error("[hooks] could not record a used hook:", err);
  }
}

/**
 * New suggestions, none of which is in the bank - checked here again after
 * Gemini, reworded copies included. Not saved: the operator keeps what they
 * want.
 */
export async function suggestHooks(input: {
  count?: unknown;
  plantSlug?: unknown;
  direction?: unknown;
}): Promise<string[]> {
  const count = Math.min(12, Math.max(1, Number(input.count) || 6));
  const plant = typeof input.plantSlug === "string" && input.plantSlug ? getPlant(input.plantSlug) : undefined;
  const direction =
    typeof input.direction === "string" ? input.direction.trim().slice(0, 300) : "";

  const store = getStore();
  const [hooks, carousels] = await Promise.all([store.listHooks(), store.listCarousels()]);
  const known = [...hooks.map((h) => h.text), ...carousels.map((c) => c.theme)].filter(Boolean);
  const exclude = Array.from(new Map(known.map((t) => [hookKey(t), t])).values());

  const vetoes = plantVetoes();
  const fresh: string[] = [];
  // A second round only if the first came back mostly as repeats.
  for (let round = 0; round < 2 && fresh.length < count; round++) {
    const ideas = await generateHookIdeas({
      count: count + 3,
      exclude: [...exclude, ...fresh],
      ...(plant ? { plantName: localizedPlantName(plant, "fr") } : {}),
      ...(direction ? { direction } : {}),
    });
    for (const idea of ideas) {
      if (fresh.length >= count) break;
      if (exclude.some((e) => sameHook(e, idea, vetoes)) || fresh.some((f) => sameHook(f, idea, vetoes))) continue;
      fresh.push(idea.slice(0, HOOK_MAX_LENGTH));
    }
  }
  return fresh;
}

import "server-only";
import { randomToken } from "@/lib/crypto";
import { getPlant } from "@/lib/data/plants";
import { plantName as localizedPlantName } from "@/lib/data/localize";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { generateHookIdeas } from "@/lib/gemini";
import { HOOK_MAX_LENGTH, hookKey, sameHook } from "@/lib/hook-key";
import { getStore } from "@/lib/store";
import type { Hook, HookSource, HookStatus } from "@/lib/types";

/**
 * The hook bank: every cover line already used, kept as an idea, or seen on a
 * spied account.
 *
 * It exists for one reason - the next suggestions must not be these again -
 * and grows by itself: a carousel records its hook when it starts, a spied
 * carousel records the one it was rebuilt with.
 */

function cleanText(raw: unknown): string {
  const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (text.length < 3) throw badRequest("Écris le hook, au moins quelques mots.");
  return text.slice(0, HOOK_MAX_LENGTH);
}

export async function listHooks(): Promise<Hook[]> {
  return getStore().listHooks();
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
 * Never fails the caller: a carousel does not stop because its hook could not
 * be filed.
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
      if (exclude.some((e) => sameHook(e, idea)) || fresh.some((f) => sameHook(f, idea))) continue;
      fresh.push(idea.slice(0, HOOK_MAX_LENGTH));
    }
  }
  return fresh;
}

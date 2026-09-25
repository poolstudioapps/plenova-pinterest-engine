"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HookSuggestions } from "@/components/hooks/HookSuggestions";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Notice,
  RowMenu,
  RowMenuItem,
} from "@/components/ui";
import type { PlantIdentity } from "@/lib/data/localize";
import { HOOK_MAX_LENGTH, hookKey, sameHook } from "@/lib/hook-key";
import { translator, type TranslationKey } from "@/lib/i18n";
import type { Hook, HookSource } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

const SOURCE_LABELS: Record<HookSource, TranslationKey> = {
  manual: "hooks.sourceManual",
  gemini: "hooks.sourceGemini",
  carousel: "hooks.sourceCarousel",
  spy: "hooks.sourceSpy",
};

type Filter = "all" | "idea" | "used";

/**
 * The hook bank, whole: search it, add to it, fix a typo, set one aside as
 * used, delete one - and ask Gemini for new ones it has never given.
 */
export function HooksClient({
  initialHooks,
  plants,
}: {
  initialHooks: Hook[];
  plants: PlantIdentity[];
}) {
  const t = translator();
  const router = useRouter();
  const [hooks, setHooks] = useState(initialHooks);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: hooks.length,
      idea: hooks.filter((h) => h.status === "idea").length,
      used: hooks.filter((h) => h.status === "used").length,
    }),
    [hooks],
  );

  const q = hookKey(search);
  const shown = hooks.filter(
    (h) => (filter === "all" || h.status === filter) && (!q || h.key.includes(q)),
  );

  // Said while typing, before the button: the bank refuses copies anyway.
  const twin = draft.trim().length > 3 ? hooks.find((h) => sameHook(h.text, draft)) : undefined;

  function use(text: string) {
    router.push(`/carousels?theme=${encodeURIComponent(text)}`);
  }

  function upsertLocal(hook: Hook) {
    setHooks((current) => [hook, ...current.filter((h) => h.id !== hook.id)]);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setAdding(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        hook?: Hook;
        existed?: boolean;
        error?: { message?: string };
      };
      if (!res.ok || !data.hook) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      if (data.existed) {
        setInfo(t("hooks.duplicate", { text: data.hook.text }));
      } else {
        upsertLocal(data.hook);
        setDraft("");
        setInfo(t("hooks.added"));
      }
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setAdding(false);
    }
  }

  async function patch(hook: Hook, body: { text?: string; status?: Hook["status"] }) {
    setError(null);
    try {
      const res = await fetch(`/api/hooks/${encodeURIComponent(hook.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { hook?: Hook; error?: { message?: string } };
      if (!res.ok || !data.hook) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return false;
      }
      const updated = data.hook;
      setHooks((current) => current.map((h) => (h.id === updated.id ? updated : h)));
      return true;
    } catch {
      setError(t("preview.unreachable"));
      return false;
    }
  }

  async function remove(hook: Hook) {
    setError(null);
    try {
      const res = await fetch(`/api/hooks/${encodeURIComponent(hook.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setHooks((current) => current.filter((h) => h.id !== hook.id));
    } catch {
      setError(t("preview.requestFailed"));
    } finally {
      setConfirming(null);
    }
  }

  const filters: { key: Filter; label: TranslationKey }[] = [
    { key: "all", label: "hooks.filterAll" },
    { key: "idea", label: "hooks.filterIdea" },
    { key: "used", label: "hooks.filterUsed" },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5 md:p-6">
        <h2 className="mb-3 text-[15px] font-semibold">{t("hooks.suggestTitle")}</h2>
        <HookSuggestions plants={plants} onKept={upsertLocal} onUse={use} />
      </Card>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-[var(--color-line)] p-4 md:p-5">
          <form onSubmit={add} className="flex gap-2">
            <Input
              value={draft}
              maxLength={HOOK_MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("hooks.addPlaceholder")}
              aria-label={t("hooks.addPlaceholder")}
            />
            <Button type="submit" variant="primary" loading={adding} disabled={adding || draft.trim().length < 3}>
              {t("hooks.add")}
            </Button>
          </form>
          {twin ? (
            <p className="text-[12.5px] text-[var(--color-warn-ink)]">
              {t("hooks.nearDuplicate", { text: twin.text })}
            </p>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {info ? <Notice tone="info">{info}</Notice> : null}

          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" className="flex gap-0.5 rounded-full bg-[var(--color-surface-muted)] p-1">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors",
                    filter === f.key
                      ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
                      : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                  )}
                >
                  {t(f.label)} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto w-full sm:w-64">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("hooks.search")}
                aria-label={t("hooks.search")}
              />
            </div>
          </div>
        </div>

        {hooks.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("hooks.empty")} description={t("hooks.emptyBody")} />
          </div>
        ) : shown.length === 0 ? (
          <p className="p-5 text-[13px] text-[var(--color-ink-faint)]">{t("hooks.noMatch")}</p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {shown.map((hook) => (
              <li key={hook.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
                <div className="min-w-[220px] flex-1">
                  {editing?.id === hook.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await patch(hook, { text: editing.text })) setEditing(null);
                      }}
                    >
                      <Input
                        autoFocus
                        value={editing.text}
                        maxLength={HOOK_MAX_LENGTH}
                        onChange={(e) => setEditing({ id: hook.id, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditing(null);
                          }
                        }}
                      />
                      <Button type="submit" size="sm" variant="primary">
                        {t("hooks.save")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        {t("hooks.cancel")}
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onDoubleClick={() => setEditing({ id: hook.id, text: hook.text })}
                      className={cn(
                        "text-left text-[14.5px] font-medium",
                        hook.status === "used" && "text-[var(--color-ink-soft)]",
                      )}
                      title={t("hooks.edit")}
                    >
                      {hook.text}
                    </button>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-ink-faint)]">
                    <Badge
                      className={
                        hook.status === "idea"
                          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
                          : undefined
                      }
                    >
                      {hook.status === "idea" ? t("hooks.statusIdea") : t("hooks.statusUsed")}
                    </Badge>
                    <Badge>{t(SOURCE_LABELS[hook.source])}</Badge>
                    <span>
                      {hook.usedAt
                        ? t("hooks.usedIn", { when: relativeTime(hook.usedAt) })
                        : t("hooks.addedWhen", { when: relativeTime(hook.createdAt) })}
                    </span>
                  </p>
                </div>
                {editing?.id === hook.id ? null : (
                  <>
                    <Button size="sm" onClick={() => use(hook.text)} title={t("hooks.useHint")}>
                      {t("hooks.use")}
                    </Button>
                    <RowMenu label={t("hooks.more")} onClose={() => setConfirming(null)}>
                      <RowMenuItem onClick={() => setEditing({ id: hook.id, text: hook.text })}>
                        {t("hooks.edit")}
                      </RowMenuItem>
                      <RowMenuItem
                        onClick={() => void patch(hook, { status: hook.status === "idea" ? "used" : "idea" })}
                      >
                        {hook.status === "idea" ? t("hooks.markUsed") : t("hooks.markIdea")}
                      </RowMenuItem>
                      <RowMenuItem
                        danger
                        keepOpen={confirming !== hook.id}
                        onClick={() => {
                          if (confirming === hook.id) void remove(hook);
                          else setConfirming(hook.id);
                        }}
                      >
                        {confirming === hook.id ? t("hooks.confirmDelete") : t("hooks.delete")}
                      </RowMenuItem>
                    </RowMenu>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

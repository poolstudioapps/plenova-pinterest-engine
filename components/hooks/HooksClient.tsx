"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HookDetail } from "@/components/hooks/HookDetail";
import { HookSuggestions } from "@/components/hooks/HookSuggestions";
import { FORMAT_LABELS, HookThumb, SOURCE_LABELS, TierBadge } from "@/components/hooks/parts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Notice,
  Picker,
  RowMenu,
  RowMenuItem,
  Pager,
  paginate,
} from "@/components/ui";
import type { PlantIdentity } from "@/lib/data/localize";
import { HOOK_MAX_LENGTH, hookKey, sameHook } from "@/lib/hook-key";
import { TIERS, assignTiers, multiplier, outperformance, type Tier } from "@/lib/hook-tiers";
import { translator, type ContentLocale, type TranslationKey } from "@/lib/i18n";
import { compactNumber, compareEngagement } from "@/lib/spy-format";
import { HOOK_FORMATS, type HookView } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

type Status = "all" | "idea" | "used";
type Source = "all" | "spy" | "ours";
type Sort = "views" | "perf" | "engagement" | "recent";

/**
 * The hook bank, whole.
 *
 * Two ways to look at it. The tier list ranks every hook seen on the watched
 * accounts by the views of the carousel it opened - the ideas worth stealing
 * first. The list holds everything, ours included, to search, fix, sort and
 * clean. Any hook opens into its carousel and numbers.
 */
export function HooksClient({
  initialHooks,
  initialUnread,
  plants,
  defaultLanguages,
  hasPexels,
}: {
  initialHooks: HookView[];
  initialUnread: number;
  plants: PlantIdentity[];
  defaultLanguages: ContentLocale[];
  hasPexels: boolean;
}) {
  const t = translator();
  const router = useRouter();
  const [hooks, setHooks] = useState(initialHooks);
  const [unread, setUnread] = useState(initialUnread);
  const [reading, setReading] = useState(false);
  const [view, setView] = useState<"tiers" | "list">("tiers");
  const [page, setPage] = useState(1);
  const listTop = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("all");
  const [source, setSource] = useState<Source>("all");
  const [account, setAccount] = useState("");
  const [format, setFormat] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("views");
  const [showSuggest, setShowSuggest] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Ranked over the whole bank, so a hook keeps its tier whatever is filtered.
  const tiers = useMemo(() => assignTiers(hooks), [hooks]);
  const accounts = useMemo(
    () => Array.from(new Set(hooks.flatMap((h) => (h.spy ? [h.spy.username] : [])))).sort(),
    [hooks],
  );

  const q = hookKey(search);
  const shown = hooks.filter((h) => {
    if (status !== "all" && h.status !== status) return false;
    if (source === "spy" && !h.spy) return false;
    if (source === "ours" && h.spy) return false;
    if (account && h.spy?.username !== account) return false;
    if (format && h.spy?.format !== format) return false;
    if (q && !h.key.includes(q) && !hookKey(h.spy?.original ?? "").includes(q)) return false;
    return true;
  });

  const sorted = [...shown].sort((a, b) => {
    if (sort === "engagement") return compareEngagement(a.spy, b.spy);
    const score = (h: HookView) =>
      sort === "views"
        ? (h.spy?.views ?? -1)
        : sort === "perf"
          ? (outperformance(h.spy) ?? -1)
          : Date.parse(h.createdAt);
    return score(b) - score(a);
  });

  // The tier list, flattened in its reading order (S to D, then ours without
  // numbers), so it can be cut in pages of 20 like everything else.
  const ranked = [
    ...TIERS.flatMap((tier) =>
      shown
        .filter((h) => tiers.get(h.id) === tier)
        .sort((a, b) => (b.spy?.views ?? 0) - (a.spy?.views ?? 0))
        .map((hook) => ({ hook, tier: tier as Tier | null })),
    ),
    ...(source !== "spy" && !account && !format
      ? shown.filter((h) => !h.spy).map((hook) => ({ hook, tier: null as Tier | null }))
      : []),
  ];
  const tierPage = paginate(ranked, page);
  const listPage = paginate(sorted, page);
  const current = view === "tiers" ? tierPage : listPage;
  const total = view === "tiers" ? ranked.length : sorted.length;

  // A new filter, sort or view starts again at page 1.
  useEffect(() => {
    setPage(1);
  }, [view, status, source, account, format, search, sort]);

  function goTo(next: number) {
    setPage(next);
    listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const twin = draft.trim().length > 3 ? hooks.find((h) => sameHook(h.text, draft)) : undefined;
  const open = detail ? hooks.find((h) => h.id === detail) : undefined;

  // ------------------------------------------------------------------ data

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/hooks", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { hooks: HookView[]; unread: number };
      setHooks(data.hooks);
      setUnread(data.unread);
      return data.unread;
    } catch {
      return null;
    }
  }, []);

  // While covers are being read, the list fills in as they land.
  useEffect(() => {
    if (!reading) return;
    let last = unread;
    let still = 0;
    let failures = 0;
    const timer = window.setInterval(async () => {
      const left = await refresh();
      if (left === null) {
        // Unreachable a few times running: stop, and say so.
        failures += 1;
        if (failures >= 4) {
          setReading(false);
          setError(t("preview.unreachable"));
        }
        return;
      }
      failures = 0;
      still = left === last ? still + 1 : 0;
      last = left;
      if (left === 0 || still >= 8) setReading(false);
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, refresh]);

  async function readCovers() {
    setError(null);
    try {
      const res = await fetch("/api/spy/hooks", { method: "POST" });
      if (!res.ok) throw new Error();
      setReading(true);
    } catch {
      setError(t("preview.requestFailed"));
    }
  }

  function use(text: string) {
    router.push(`/carousels?theme=${encodeURIComponent(text)}`);
  }

  function upsertLocal(hook: HookView) {
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
        hook?: HookView;
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
        upsertLocal({ ...data.hook, spy: null });
        setDraft("");
        setInfo(t("hooks.added"));
      }
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setAdding(false);
    }
  }

  async function patch(hook: HookView, body: { text?: string; status?: HookView["status"] }) {
    setError(null);
    try {
      const res = await fetch(`/api/hooks/${encodeURIComponent(hook.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { hook?: HookView; error?: { message?: string } };
      if (!res.ok || !data.hook) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return false;
      }
      const updated = data.hook;
      // The server answers with the bare hook; its evidence does not change.
      setHooks((current) => current.map((h) => (h.id === updated.id ? { ...updated, spy: h.spy } : h)));
      return true;
    } catch {
      setError(t("preview.unreachable"));
      return false;
    }
  }

  async function remove(hook: HookView) {
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

  // ---------------------------------------------------------------- render

  const statusTabs: { key: Status; label: TranslationKey }[] = [
    { key: "all", label: "hooks.filterAll" },
    { key: "idea", label: "hooks.filterIdea" },
    { key: "used", label: "hooks.filterUsed" },
  ];

  const menu = (hook: HookView) => (
    <RowMenu label={t("hooks.more")} onClose={() => setConfirming(null)}>
      <RowMenuItem onClick={() => setDetail(hook.id)}>{t("hooks.detailTitle")}</RowMenuItem>
      <RowMenuItem
        onClick={() => {
          setView("list");
          setEditing({ id: hook.id, text: hook.text });
        }}
      >
        {t("hooks.edit")}
      </RowMenuItem>
      <RowMenuItem onClick={() => void patch(hook, { status: hook.status === "idea" ? "used" : "idea" })}>
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
  );

  /** One hook in the tier list: its cover, its words, what it did. */
  const tierCard = (hook: HookView) => (
    <li key={hook.id} className="flex gap-3 rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5">
      <HookThumb
        src={hook.spy?.images[0]?.url}
        className="h-[92px] w-[69px]"
        onClick={() => setDetail(hook.id)}
        label={t("hooks.detailTitle")}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setDetail(hook.id)}
          className={cn(
            "line-clamp-3 text-left text-[13.5px] leading-snug font-semibold hover:underline",
            hook.status === "used" && "text-[var(--color-ink-soft)]",
          )}
        >
          {hook.text}
        </button>
        {hook.spy ? (
          <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-1.5 text-[11.5px] text-[var(--color-ink-faint)]">
            <span className="font-semibold text-[var(--color-ink)] tabular-nums">
              {compactNumber(hook.spy.views)} {t("hooks.views")}
            </span>
            <span className="tabular-nums" title={t("hooks.perf")}>
              {multiplier(outperformance(hook.spy))}
            </span>
            <span className="truncate">@{hook.spy.username}</span>
            {hook.status === "used" ? <span>· {t("hooks.statusUsed")}</span> : null}
          </p>
        ) : null}
      </div>
    </li>
  );

  const tierFloor = (tier: Tier) => {
    const views = hooks.filter((h) => tiers.get(h.id) === tier && h.spy).map((h) => h.spy!.views);
    return views.length ? Math.min(...views) : null;
  };

  return (
    <div className="space-y-6">
      {unread > 0 ? (
        <Notice tone={reading ? "info" : "warn"}>
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{reading ? t("hooks.reading", { n: unread }) : t("hooks.unread", { n: unread })}</span>
            {reading ? null : (
              <Button size="sm" onClick={() => void readCovers()}>
                {t("hooks.readNow")}
              </Button>
            )}
          </span>
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <div className="space-y-3 p-4 md:p-5">
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
            <Button
              type="button"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setShowSuggest((v) => !v)}
              aria-expanded={showSuggest}
            >
              {showSuggest ? t("hooks.suggestHide") : t("hooks.suggestToggle")}
            </Button>
          </form>
          {twin ? (
            <p className="text-[12.5px] text-[var(--color-warn-ink)]">
              {t("hooks.nearDuplicate", { text: twin.text })}
            </p>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {info ? <Notice tone="info">{info}</Notice> : null}
          {showSuggest ? (
            <div className="rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-4">
              <HookSuggestions plants={plants} onKept={(hook) => upsertLocal({ ...hook, spy: null })} onUse={use} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-4 py-3 md:px-5">
          <div role="tablist" className="flex gap-0.5 rounded-full bg-[var(--color-surface-muted)] p-1">
            {(["tiers", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-full px-3.5 py-1 text-[12.5px] font-semibold transition-colors",
                  view === v
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                )}
              >
                {v === "tiers" ? t("hooks.viewTiers") : t("hooks.viewList")}
              </button>
            ))}
          </div>
          <div role="tablist" className="flex gap-0.5 rounded-full bg-[var(--color-surface-muted)] p-1">
            {statusTabs.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={status === f.key}
                onClick={() => setStatus(f.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors",
                  status === f.key
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                )}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
          <div className="w-44">
            <Picker
              options={[
                { value: "all", label: t("hooks.sourceAll") },
                { value: "spy", label: t("hooks.sourceOnlySpy") },
                { value: "ours", label: t("hooks.sourceOurs") },
              ]}
              value={source}
              onChange={(v) => setSource(v as Source)}
            />
          </div>
          <div className="w-44">
            <Picker
              options={[
                { value: "", label: t("hooks.allAccounts") },
                ...accounts.map((a) => ({ value: a, label: `@${a}` })),
              ]}
              value={account}
              onChange={setAccount}
            />
          </div>
          <div className="w-44">
            <Picker
              options={[
                { value: "", label: t("hooks.allFormats") },
                ...HOOK_FORMATS.map((f) => ({ value: f, label: t(FORMAT_LABELS[f]) })),
              ]}
              value={format}
              onChange={setFormat}
            />
          </div>
          {view === "list" ? (
            <div className="w-40">
              <Picker
                options={[
                  { value: "views", label: t("hooks.sortViews") },
                  { value: "perf", label: t("hooks.sortPerf") },
                  { value: "engagement", label: t("hooks.sortEngagement") },
                  { value: "recent", label: t("hooks.sortRecent") },
                ]}
                value={sort}
                onChange={(v) => setSort(v as Sort)}
              />
            </div>
          ) : null}
          <div className="min-w-[180px] flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("hooks.search")}
              aria-label={t("hooks.search")}
            />
          </div>
        </div>
      </Card>

      {hooks.length === 0 ? (
        <EmptyState title={t("hooks.empty")} description={t("hooks.emptyBody")} />
      ) : view === "tiers" ? (
        <div ref={listTop} className="scroll-mt-4 space-y-4">
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
            {t("hooks.tierHint")} · {t("hooks.shown", { n: shown.length })}
          </p>
          {ranked.length === 0 ? <p className="text-[13px] text-[var(--color-ink-faint)]">{t("hooks.noMatch")}</p> : null}
          {/* This page's hooks, grouped under their tier (a tier can span pages). */}
          {[...TIERS, null].map((tier) => {
            const onPage = tierPage.items.filter((r) => r.tier === tier).map((r) => r.hook);
            if (onPage.length === 0) return null;
            if (tier === null) {
              return (
                <section key="ours" className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                  <p className="text-[12.5px] font-semibold text-[var(--color-ink-soft)]">{t("hooks.noStats")}</p>
                  <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{onPage.map(tierCard)}</ul>
                </section>
              );
            }
            const floor = tierFloor(tier);
            const inTier = ranked.filter((r) => r.tier === tier).length;
            return (
              <section key={tier} className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                <div className="flex items-center gap-3 md:flex-col md:items-start">
                  <TierBadge tier={tier} large />
                  <p className="text-[12px] text-[var(--color-ink-faint)]">
                    {floor !== null ? t("hooks.tierFloor", { n: compactNumber(floor) }) : null}
                    <br />
                    {t("hooks.shown", { n: inTier })}
                  </p>
                </div>
                <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{onPage.map(tierCard)}</ul>
              </section>
            );
          })}
          <Pager page={current.page} pages={current.pages} total={total} onChange={goTo} className="pt-2" />
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-faint)]">{t("hooks.noMatch")}</p>
      ) : (
        <div ref={listTop} className="scroll-mt-4 space-y-3">
        <Card>
          <ul className="divide-y divide-[var(--color-line)]">
            {listPage.items.map((hook) => {
              const tier = tiers.get(hook.id);
              return (
                <li key={hook.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
                  {hook.spy ? (
                    <HookThumb
                      src={hook.spy.images[0]?.url}
                      className="h-[64px] w-[48px]"
                      onClick={() => setDetail(hook.id)}
                      label={t("hooks.detailTitle")}
                    />
                  ) : null}
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
                        onClick={() => setDetail(hook.id)}
                        className={cn(
                          "text-left text-[14.5px] font-medium hover:underline",
                          hook.status === "used" && "text-[var(--color-ink-soft)]",
                        )}
                      >
                        {hook.text}
                      </button>
                    )}
                    {hook.spy?.original && editing?.id !== hook.id ? (
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--color-ink-faint)] italic">
                        « {hook.spy.original} »{hook.spy.lang ? ` · ${hook.spy.lang}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-ink-faint)]">
                      {tier ? <TierBadge tier={tier} /> : null}
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
                      {hook.spy?.format ? <Badge>{t(FORMAT_LABELS[hook.spy.format])}</Badge> : null}
                      {hook.spy ? (
                        <span className="tabular-nums">
                          <strong className="text-[var(--color-ink)]">{compactNumber(hook.spy.views)}</strong>{" "}
                          {t("hooks.views")} · {multiplier(outperformance(hook.spy))} {t("hooks.perfShort")} · @
                          {hook.spy.username}
                        </span>
                      ) : (
                        <span>
                          {hook.usedAt
                            ? t("hooks.usedIn", { when: relativeTime(hook.usedAt) })
                            : t("hooks.addedWhen", { when: relativeTime(hook.createdAt) })}
                        </span>
                      )}
                    </p>
                  </div>
                  {editing?.id === hook.id ? null : (
                    <>
                      <Button size="sm" onClick={() => use(hook.text)} title={t("hooks.useHint")}>
                        {t("hooks.use")}
                      </Button>
                      {menu(hook)}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        <Pager page={current.page} pages={current.pages} total={total} onChange={goTo} />
        </div>
      )}

      {open ? (
        <HookDetail
          hook={open}
          tier={tiers.get(open.id)}
          defaultLanguages={defaultLanguages}
          hasPexels={hasPexels}
          onClose={() => setDetail(null)}
          onUse={use}
          onToggleStatus={(hook) => void patch(hook, { status: hook.status === "idea" ? "used" : "idea" })}
          onRebuilt={() => void refresh()}
        />
      ) : null}
    </div>
  );
}

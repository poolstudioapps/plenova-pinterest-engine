"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonLink, Card, Dialog, EmptyState, Notice, Pager, Picker, paginate } from "@/components/ui";
import { ProcessDialog } from "@/components/spy/ProcessDialog";
import { SpyAccounts } from "@/components/spy/SpyAccounts";
import { SpyPostCard } from "@/components/spy/SpyPostCard";
import { translator, type ContentLocale, type TranslationKey } from "@/lib/i18n";
import { sortSpyPosts, type SpySort } from "@/lib/spy-format";
import type { SpyAccount, SpyPost, SpyRun } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

/** Over this long without a pass, the page says the script has stopped. */
const STALE_MS = 36 * 3600 * 1000;
/**
 * The spy folder registers this link with Windows the first time it is
 * double-clicked; the button opens it, and the browser hands it to Windows,
 * which starts the folder's own launcher. A web page cannot start a program
 * any other way, nor learn where a file sits on the computer.
 */
const LAUNCH_URL = "plenova-spy://run";
const LAUNCH_READY_KEY = "plenova.spyLauncherReady";

const TABS: { key: "inbox" | "done" | "accounts"; label: TranslationKey }[] = [
  { key: "inbox", label: "spy.tabInbox" },
  { key: "done", label: "spy.tabDone" },
  { key: "accounts", label: "spy.tabAccounts" },
];

/**
 * The spy page: what the watched accounts published, what was done with it,
 * and which accounts are watched.
 *
 * A carousel is shown once. Processing it or setting it aside moves it to
 * "Déjà traités" for good - the script never brings back a post it already
 * knows, it only refreshes its numbers.
 */
export function SpyClient({
  initialPosts,
  initialAccounts,
  run: initialRun,
  defaultLanguages,
  hasPexels,
}: {
  initialPosts: SpyPost[];
  initialAccounts: SpyAccount[];
  run: SpyRun | null;
  defaultLanguages: ContentLocale[];
  hasPexels: boolean;
}) {
  const t = translator();
  const [posts, setPosts] = useState(initialPosts);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [run, setRun] = useState(initialRun);
  const [tab, setTab] = useState<"inbox" | "done" | "accounts">("inbox");
  const [sort, setSort] = useState<SpySort>("engagement");
  const [account, setAccount] = useState("");
  const [page, setPage] = useState(1);
  const [processing, setProcessing] = useState<SpyPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The launch button: waiting for the pass to show up, then following it.
  const [launch, setLaunch] = useState<"idle" | "waiting" | "running" | "missing">("idle");
  const [launchHelp, setLaunchHelp] = useState(false);
  const listTop = useRef<HTMLDivElement>(null);

  const byName = useMemo(() => new Map(accounts.map((a) => [a.username, a])), [accounts]);
  const inbox = posts.filter((p) => p.status === "new");
  const done = posts.filter((p) => p.status !== "new");
  const shown = sortSpyPosts(
    (tab === "done" ? done : inbox).filter((p) => !account || p.username === account),
    tab === "done" ? "recent" : sort,
  );
  // Twenty cards a page: a strip of slides each, and a few hundred of them froze the page.
  const current = paginate(shown, page);

  useEffect(() => {
    setPage(1);
  }, [tab, account, sort]);

  function goTo(next: number) {
    setPage(next);
    listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // After a launch: wait for the pass to open (or say it did not), then keep
  // the page in step with it until it closes.
  useEffect(() => {
    if (launch !== "waiting" && launch !== "running") return;
    const before = launch === "waiting" ? (run?.id ?? null) : null;
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch("/api/spy", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { posts: SpyPost[]; accounts: SpyAccount[]; run: SpyRun | null };
        setRun(data.run);
        if (launch === "waiting") {
          if (data.run && data.run.id !== before) setLaunch("running");
          else if (Date.now() - startedAt > 90_000) setLaunch("missing");
          return;
        }
        setPosts(data.posts);
        setAccounts(data.accounts);
        if (!data.run || data.run.finishedAt) setLaunch("idle");
      } catch {
        // A missed poll is caught up by the next one.
      }
    }, launch === "waiting" ? 5000 : 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch]);

  function openLauncher() {
    setLaunchHelp(false);
    try {
      window.localStorage.setItem(LAUNCH_READY_KEY, "1");
    } catch {
      // Private window: the help simply shows again next time.
    }
    window.location.href = LAUNCH_URL;
    setLaunch("waiting");
  }

  function startSpy() {
    let ready = false;
    try {
      ready = window.localStorage.getItem(LAUNCH_READY_KEY) === "1";
    } catch {
      ready = false;
    }
    if (ready) openLauncher();
    else setLaunchHelp(true);
  }

  async function setStatus(post: SpyPost, status: "new" | "dismissed") {
    setError(null);
    setPosts((current) =>
      current.map((p) =>
        p.id === post.id
          ? { ...p, status, handledAt: status === "new" ? null : new Date().toISOString(), ...(status === "new" ? { carouselId: null } : {}) }
          : p,
      ),
    );
    try {
      const res = await fetch(`/api/spy/posts/${encodeURIComponent(post.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Only this post goes back: anything else changed meanwhile stays.
      setPosts((current) => current.map((p) => (p.id === post.id ? post : p)));
      setError(t("preview.requestFailed"));
    }
  }

  // What the page says about the script.
  const stale = !run || Date.now() - Date.parse(run.startedAt) > STALE_MS;
  const running = run && !run.finishedAt && Date.now() - Date.parse(run.startedAt) < 3600 * 1000;
  // Never closed and long over: the window was closed mid-pass.
  const interrupted = Boolean(run && !run.finishedAt && !running) || Boolean(run?.errors.some((e) => e.username === "*"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[260px] flex-1">
      {!run ? (
        <Notice tone="warn">{t("spy.neverRan")}</Notice>
      ) : stale && !running ? (
        <Notice tone="warn">{t("spy.stale", { when: relativeTime(run.startedAt) })}</Notice>
      ) : (
        <Notice tone="info">
          {running
            ? t("spy.lastRunRunning", { when: relativeTime(run.startedAt) })
            : t("spy.lastRun", { when: relativeTime(run.startedAt), found: run.found, added: run.added })}
          {run.errors.some((e) => e.username !== "*")
            ? ` ${t("spy.lastRunErrors", {
                names: run.errors
                  .filter((e) => e.username !== "*")
                  .map((e) => `@${e.username}`)
                  .join(", "),
              })}`
            : ""}
          {interrupted ? ` ${t("spy.lastRunInterrupted")}` : ""}
        </Notice>
      )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="primary"
            onClick={startSpy}
            loading={launch === "waiting"}
            disabled={launch === "waiting" || launch === "running" || Boolean(running)}
          >
            {launch === "waiting" ? t("spy.launchWaiting") : running || launch === "running" ? t("spy.launchRunning") : t("spy.launch")}
          </Button>
          <button
            type="button"
            onClick={() => setLaunchHelp(true)}
            className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] hover:underline"
          >
            {t("spy.launchHowTo")}
          </button>
        </div>
      </div>
      {launch === "missing" ? (
        <Notice tone="warn" title={t("spy.launchMissingTitle")}>
          {t("spy.launchMissingBody")}
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <div role="tablist" className="flex border-b border-[var(--color-line)]">
          {TABS.map((item) => {
            const count =
              item.key === "inbox" ? inbox.length : item.key === "done" ? done.length : accounts.length;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-5 py-3.5 text-[14px] font-medium transition-colors",
                  tab === item.key
                    ? "border-[var(--color-accent)] text-[var(--color-ink)]"
                    : "border-transparent text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]",
                )}
              >
                {t(item.label)}
                <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11.5px] tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {tab !== "accounts" ? (
          <div className="flex flex-wrap items-end gap-3 p-4">
            <div className="w-56">
              <Picker
                options={[
                  { value: "", label: t("spy.allAccounts") },
                  ...accounts.map((a) => ({
                    value: a.username,
                    label: `@${a.username}`,
                    ...(a.displayName ? { detail: a.displayName } : {}),
                  })),
                ]}
                value={account}
                onChange={setAccount}
              />
            </div>
            {tab === "inbox" ? (
              <div className="w-48">
                <Picker
                  options={[
                    { value: "engagement", label: t("spy.sortEngagement") },
                    { value: "views", label: t("spy.sortViews") },
                    { value: "recent", label: t("spy.sortRecent") },
                  ]}
                  value={sort}
                  onChange={(v) => setSort(v as SpySort)}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-4 md:p-5">
            <SpyAccounts accounts={accounts} onChange={setAccounts} mode="competitors" />
          </div>
        )}
      </Card>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {tab === "accounts" ? null : shown.length === 0 ? (
        <EmptyState
          title={tab === "inbox" ? t("spy.inboxEmpty") : t("spy.doneEmpty")}
          description={tab === "inbox" ? t("spy.inboxEmptyBody") : t("spy.doneEmptyBody")}
        />
      ) : (
        <div ref={listTop} className="scroll-mt-4 space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          {current.items.map((post) => (
            <SpyPostCard
              key={post.id}
              post={post}
              account={byName.get(post.username)}
              actions={
                post.status === "new" ? (
                  <>
                    {post.fromHistory ? (
                      <span className="text-[12px] text-[var(--color-ink-faint)]" title={t("spy.historyPendingHint")}>
                        {t("spy.historyPending")}
                      </span>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => setProcessing(post)}>
                        {t("spy.process")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => void setStatus(post, "dismissed")}>
                      {t("spy.dismiss")}
                    </Button>
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-[12.5px] font-medium text-[var(--color-accent)] hover:underline"
                    >
                      {t("spy.openTikTok")}
                    </a>
                  </>
                ) : (
                  <>
                    {post.status === "processed" && post.carouselId ? (
                      <ButtonLink href="/carousels" size="sm">
                        {t("spy.openCarousel")}
                      </ButtonLink>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => void setStatus(post, "new")}>
                      {t("spy.restore")}
                    </Button>
                    <span className="text-[12px] text-[var(--color-ink-faint)]">
                      {post.handledAt ? relativeTime(post.handledAt) : ""}
                    </span>
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-[12.5px] font-medium text-[var(--color-accent)] hover:underline"
                    >
                      {t("spy.openTikTok")}
                    </a>
                  </>
                )
              }
            />
          ))}
        </div>
        <Pager page={current.page} pages={current.pages} total={shown.length} onChange={goTo} />
        </div>
      )}

      {launchHelp ? (
        <Dialog
          title={t("spy.launchHelpTitle")}
          onClose={() => setLaunchHelp(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setLaunchHelp(false)}>
                {t("spy.launchHelpLater")}
              </Button>
              <Button variant="primary" onClick={openLauncher}>
                {t("spy.launchHelpGo")}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
            <p>{t("spy.launchHelp1")}</p>
            <p>{t("spy.launchHelp2")}</p>
            <p className="text-[12.5px] text-[var(--color-ink-faint)]">{t("spy.launchHelp3")}</p>
          </div>
        </Dialog>
      ) : null}

      {processing ? (
        <ProcessDialog
          post={processing}
          defaultLanguages={defaultLanguages}
          hasPexels={hasPexels}
          onClose={() => setProcessing(null)}
          onStarted={(postId, carousel) =>
            setPosts((current) =>
              current.map((p) =>
                p.id === postId
                  ? { ...p, status: "processed", carouselId: carousel.id, handledAt: new Date().toISOString() }
                  : p,
              ),
            )
          }
        />
      ) : null}
    </div>
  );
}

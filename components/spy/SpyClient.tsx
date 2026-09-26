"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  ButtonLink,
  Card,
  Dialog,
  EmptyState,
  Notice,
  Pager,
  Picker,
  RowMenu,
  RowMenuItem,
  paginate,
} from "@/components/ui";
import { ProcessDialog } from "@/components/spy/ProcessDialog";
import { SpyAccounts } from "@/components/spy/SpyAccounts";
import { SpyPostCard } from "@/components/spy/SpyPostCard";
import { translator, type ContentLocale, type TranslationKey } from "@/lib/i18n";
import { sortSpyPosts, type SpySort } from "@/lib/spy-format";
import type { SpyAccount, SpyPost, SpyRun, SpyTeamState, Team } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { TEAM_META } from "@/lib/versus-stats";

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

type Tab = "inbox" | Team | "accounts";

/** "To process" is the viewer's team's; each team has its own "processed" tab. */
const TABS: { key: Tab; label: TranslationKey }[] = [
  { key: "inbox", label: "spy.tabInbox" },
  { key: "stark", label: "spy.tabDoneStark" },
  { key: "mousk", label: "spy.tabDoneMousk" },
  { key: "accounts", label: "spy.tabAccounts" },
];

/** Same name as TEAM_COOKIE in lib/viewer.ts (server side). */
const TEAM_COOKIE = "plenova_team";
const UNTOUCHED: SpyTeamState = { status: "new", carouselId: null, handledAt: null };

/** A post as one team sees it: that team's status on top. */
function asTeam(post: SpyPost, team: Team | null): SpyPost {
  return { ...post, ...(team ? post.teams[team] : UNTOUCHED) };
}

/**
 * The spy page: what the watched accounts published, what each team did with
 * it, and which accounts are watched.
 *
 * Mr Stark and Mr Mousk work through the same carousels each on their own
 * (asked for by the user): what one team processes or sets aside stays "to
 * process" for the other. The signed-in address says which team is looking;
 * an address without one picks it here. Each team's handled carousels have
 * their own tab, and only that team can put them back.
 */
export function SpyClient({
  initialPosts,
  initialAccounts,
  run: initialRun,
  defaultLanguages,
  hasPexels,
  team,
  teamFixed,
}: {
  initialPosts: SpyPost[];
  initialAccounts: SpyAccount[];
  run: SpyRun | null;
  defaultLanguages: ContentLocale[];
  hasPexels: boolean;
  /** Who the viewer processes for; null until chosen. */
  team: Team | null;
  /** Set by the signed-in address: shown, not chosen. */
  teamFixed: boolean;
}) {
  const t = translator();
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [run, setRun] = useState(initialRun);
  const [tab, setTab] = useState<Tab>("inbox");
  const [sort, setSort] = useState<SpySort>("engagement");
  const [account, setAccount] = useState("");
  const [page, setPage] = useState(1);
  const [processing, setProcessing] = useState<SpyPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // The launch button: waiting for the pass to show up, then following it.
  const [launch, setLaunch] = useState<"idle" | "waiting" | "running" | "missing">("idle");
  const [launchHelp, setLaunchHelp] = useState(false);
  const listTop = useRef<HTMLDivElement>(null);

  const byName = useMemo(() => new Map(accounts.map((a) => [a.username, a])), [accounts]);
  const inbox = team ? posts.filter((p) => p.teams[team].status === "new").map((p) => asTeam(p, team)) : [];
  const doneBy = (who: Team) => posts.filter((p) => p.teams[who].status !== "new").map((p) => asTeam(p, who));
  const listed = tab === "inbox" ? inbox : tab === "stark" || tab === "mousk" ? doneBy(tab) : [];
  const shown = sortSpyPosts(
    listed.filter((p) => !account || p.username === account),
    tab === "inbox" ? sort : "recent",
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

  /** Where the viewer's team stands with a post, changed here at once. */
  function withState(post: SpyPost, state: SpyTeamState): SpyPost {
    if (!team) return post;
    return { ...post, teams: { ...post.teams, [team]: state } };
  }

  function chooseTeam(next: Team) {
    document.cookie = `${TEAM_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  async function setStatus(post: SpyPost, status: "new" | "dismissed") {
    if (!team) return;
    setError(null);
    const before = posts.find((p) => p.id === post.id) ?? post;
    setPosts((current) =>
      current.map((p) =>
        p.id === post.id
          ? withState(
              p,
              status === "new"
                ? UNTOUCHED
                : { status, carouselId: p.teams[team].carouselId, handledAt: new Date().toISOString() },
            )
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
      setPosts((current) => current.map((p) => (p.id === post.id ? before : p)));
      setError(t("preview.requestFailed"));
    }
  }

  async function removePost(post: SpyPost) {
    setError(null);
    setInfo(null);
    setConfirming(null);
    // Gone at once; back in place if the server says no.
    setPosts((current) => current.filter((p) => p.id !== post.id));
    try {
      const res = await fetch(`/api/spy/posts/${encodeURIComponent(post.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setInfo(t("spy.postRemoved", { name: post.username }));
    } catch {
      setPosts((current) => (current.some((p) => p.id === post.id) ? current : [...current, post]));
      setError(t("preview.requestFailed"));
    }
  }

  function removeMenu(post: SpyPost) {
    return (
      <RowMenu label={t("hooks.more")} onClose={() => setConfirming(null)}>
        <RowMenuItem
          danger
          keepOpen={confirming !== post.id}
          onClick={() => {
            if (confirming === post.id) void removePost(post);
            else setConfirming(post.id);
          }}
        >
          {confirming === post.id ? t("spy.removePostConfirm") : t("spy.removePost")}
        </RowMenuItem>
      </RowMenu>
    );
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
        <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-[var(--color-line)]">
        <div role="tablist" className="-mb-px flex flex-wrap">
          {TABS.map((item) => {
            const count =
              item.key === "inbox"
                ? inbox.length
                : item.key === "accounts"
                  ? accounts.length
                  : posts.filter((p) => p.teams[item.key as Team].status !== "new").length;
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
          {/* Who the viewer processes for: from the address, or picked here. */}
          <div className="flex items-center gap-2 px-4 py-2 text-[12.5px] text-[var(--color-ink-soft)]">
            {teamFixed && team ? (
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: TEAM_META[team].color }} />
                {t("spy.teamFor", { team: TEAM_META[team].name })}
              </span>
            ) : (
              <>
                <span>{t("spy.teamPick")}</span>
                <div className="flex gap-1 rounded-full bg-[var(--color-surface-muted)] p-0.5">
                  {(["stark", "mousk"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => chooseTeam(option)}
                      aria-pressed={team === option}
                      className={cn(
                        "rounded-full px-3 py-1 font-semibold transition-colors",
                        team === option ? "text-white" : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                      )}
                      style={team === option ? { background: TEAM_META[option].color } : undefined}
                    >
                      {TEAM_META[option].name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
      {info ? <Notice tone="info">{info}</Notice> : null}

      {tab === "accounts" ? null : tab === "inbox" && !team ? (
        <EmptyState title={t("spy.teamNoneTitle")} description={t("spy.teamNoneBody")} />
      ) : shown.length === 0 ? (
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
                    {removeMenu(post)}
                  </>
                ) : (
                  <>
                    {post.status === "processed" && post.carouselId ? (
                      <ButtonLink href="/carousels" size="sm">
                        {t("spy.openCarousel")}
                      </ButtonLink>
                    ) : null}
                    {tab === team ? (
                      <Button size="sm" variant="ghost" onClick={() => void setStatus(post, "new")}>
                        {t("spy.restore")}
                      </Button>
                    ) : null}
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
                    {tab === team ? removeMenu(post) : null}
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
                  ? withState(p, { status: "processed", carouselId: carousel.id, handledAt: new Date().toISOString() })
                  : p,
              ),
            )
          }
        />
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { SpyAccounts } from "@/components/spy/SpyAccounts";
import { VersusHero } from "@/components/versus/VersusHero";
import { compactNumber, percent } from "@/lib/spy-format";
import type { SpyAccount, SpyPost, Team } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import {
  BATTLE,
  TEAM_META,
  postsIn,
  score,
  totalsFor,
  type Period,
  type Snapshot,
  type Totals,
} from "@/lib/versus-stats";

const PERIODS: { key: Period; label: string }[] = [
  { key: "7", label: "7 jours" },
  { key: "30", label: "30 jours" },
  { key: "all", label: "Depuis le début" },
];

function format(value: number | null, kind: "number" | "percent" | "delta"): string {
  if (value === null) return "-";
  if (kind === "percent") return percent(value);
  if (kind === "delta") return `${value > 0 ? "+" : ""}${compactNumber(value)}`;
  return compactNumber(Math.round(value));
}

/**
 * Our accounts, measured: Mr Stark against Mr Mousk, then everyone together,
 * then account by account, and at the bottom the list itself - our accounts
 * are managed here, never on the Spy page. The poster on top and the duel
 * under it have their own look - red against blue - and only this screen
 * wears it.
 */
export function VersusClient({
  initialAccounts,
  posts,
  snapshots,
  trackedSince,
}: {
  initialAccounts: SpyAccount[];
  posts: SpyPost[];
  snapshots: Snapshot[];
  /** When the spy first saw one of these posts, already formatted. */
  trackedSince: string | null;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [period, setPeriod] = useState<Period>("30");

  const byTeam = useMemo(() => {
    const pick = (team: Team) => accounts.filter((a) => a.team === team);
    return { stark: pick("stark"), mousk: pick("mousk") };
  }, [accounts]);

  const stark = totalsFor(byTeam.stark, posts, snapshots, period);
  const mousk = totalsFor(byTeam.mousk, posts, snapshots, period);
  const all = totalsFor(accounts, posts, snapshots, period);
  const points = score(stark, mousk);
  // Only accounts still followed: one removed here takes its posts with it.
  const followed = new Set(accounts.map((a) => a.username));
  const top = postsIn(posts.filter((p) => followed.has(p.username)), period)
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);
  const teamOf = new Map(accounts.map((a) => [a.username, a.team]));

  const manage = (
    <section className="rounded-[16px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 md:p-5">
      <h2 className="mb-3 text-[15px] font-semibold">Nos comptes</h2>
      <SpyAccounts accounts={accounts} onChange={setAccounts} mode="ours" />
    </section>
  );

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-[20px] bg-[#0d0e1a] p-8 text-center text-white/80">
          Aucun de nos comptes n&apos;est suivi pour l&apos;instant : ajoute-les juste en dessous, avec leur équipe.
        </div>
        {manage}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Période" className="flex gap-1 rounded-full bg-[#0d0e1a] p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
                period === p.key ? "bg-white text-[#0d0e1a]" : "text-white/70 hover:text-white",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          Abonnés et likes totaux : profils TikTok. Vues, enregistrements, commentaires, partages : total des posts
          publiés sur la période, suivis par le spy{trackedSince ? ` depuis le ${trackedSince}` : ""}.
          {period === "all"
            ? " Depuis le début : seulement les posts enregistrés (les derniers de chaque profil, plus l'historique importé)."
            : ""}
        </p>
      </div>

      <VersusHero
        stark={stark.views}
        mousk={mousk.views}
        metricLabel={period === "all" ? "Vues · posts relevés" : `Vues · posts des ${period} derniers jours`}
        metricShort="Vues"
        score={{ stark: points.a, mousk: points.b }}
      />

      {/* The duel, metric by metric. */}
      <section className="overflow-hidden rounded-[20px] bg-[#0d0e1a] text-white">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-white/10 px-5 py-3 text-[12px] font-bold tracking-[0.12em] uppercase">
          <span style={{ color: TEAM_META.stark.color }}>
            Mr Stark<span className="hidden sm:inline"> · {stark.accounts} comptes</span>
          </span>
          <span className="text-white/40">duel</span>
          <span className="text-right" style={{ color: "#7d97ff" }}>
            Mr Mousk<span className="hidden sm:inline"> · {mousk.accounts} comptes</span>
          </span>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {BATTLE.map((m) => {
            const a = stark[m.key] as number | null;
            const b = mousk[m.key] as number | null;
            const known = typeof a === "number" && typeof b === "number";
            // Shifted by the lowest, so a loss of followers never reads as a win.
            const lo = known ? Math.min(a, b, 0) : 0;
            const total = known ? a - lo + (b - lo) : 0;
            const share = known && total > 0 ? (a - lo) / total : 0.5;
            const winner = !known || a === b ? null : a > b ? "stark" : "mousk";
            return (
              <li key={m.key} className="grid grid-cols-[1fr_minmax(96px,auto)_1fr] items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_minmax(120px,auto)_1fr] sm:gap-3 sm:px-5">
                <span
                  className={cn(
                    "vs-title text-[19px] whitespace-nowrap tabular-nums sm:text-[26px]",
                    winner === "stark" ? "text-white" : "text-white/55",
                  )}
                >
                  {winner === "stark" ? "▲ " : ""}
                  {format(a, m.format)}
                </span>
                <div className="text-center">
                  <p className="text-[10.5px] leading-tight font-semibold tracking-[0.06em] text-white/65 uppercase sm:text-[11.5px] sm:tracking-[0.08em]">
                    {m.label}
                  </p>
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span className="vs-bar-fill h-full" style={{ width: `${share * 100}%`, background: TEAM_META.stark.color }} />
                    <span className="vs-bar-fill h-full" style={{ width: `${(1 - share) * 100}%`, background: TEAM_META.mousk.color }} />
                  </div>
                </div>
                <span
                  className={cn(
                    "vs-title text-right text-[19px] whitespace-nowrap tabular-nums sm:text-[26px]",
                    winner === "mousk" ? "text-white" : "text-white/55",
                  )}
                >
                  {format(b, m.format)}
                  {winner === "mousk" ? " ▲" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Everyone together. */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Global · tous nos comptes</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Abonnés", format(all.followers, "number"), all.followersGained !== null ? `${format(all.followersGained, "delta")} sur la période` : "évolution dès demain"],
              ["Vues", format(all.views, "number"), `${all.posts} post(s)`],
              ["Likes (profils)", format(all.likesTotal, "number"), `${format(all.likes, "number")} sur la période`],
              ["Enregistrements", format(all.saves, "number"), "sur la période"],
              ["Commentaires", format(all.comments, "number"), `${format(all.shares, "number")} partages`],
              ["Engagement", format(all.engagement, "percent"), `${format(all.avgViews, "number")} vues / post`],
            ] as const
          ).map(([label, value, sub]) => (
            <div key={label} className="rounded-[16px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <p className="text-[12px] text-[var(--color-ink-faint)]">{label}</p>
              <p className="mt-1 text-[24px] font-semibold tabular-nums">{value}</p>
              <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-faint)]">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Account by account. */}
      <section className="overflow-hidden rounded-[16px] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <h2 className="border-b border-[var(--color-line)] px-4 py-3 text-[15px] font-semibold">Compte par compte</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-[var(--color-ink-faint)]">
                <th className="px-4 py-2 font-medium">Compte</th>
                <th className="px-3 py-2 text-right font-medium">Abonnés</th>
                <th className="px-3 py-2 text-right font-medium">Gagnés</th>
                <th className="px-3 py-2 text-right font-medium">Likes (profil)</th>
                <th className="px-3 py-2 text-right font-medium">Vues</th>
                <th className="px-3 py-2 text-right font-medium">Enreg.</th>
                <th className="px-3 py-2 text-right font-medium">Posts</th>
                <th className="px-3 py-2 text-right font-medium">Vues / post</th>
                <th className="px-4 py-2 text-right font-medium">Vu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {[...byTeam.stark, ...byTeam.mousk].map((account) => {
                const t = totalsFor([account], posts, snapshots, period);
                const meta = TEAM_META[account.team!];
                return (
                  <AccountRow key={account.username} account={account} totals={t} color={meta.color} teamName={meta.name} />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* What worked best. */}
      {top.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Meilleurs posts de la période</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {top.map((post) => {
              const team = teamOf.get(post.username);
              return (
                <li key={post.id}>
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block overflow-hidden rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface)]"
                  >
                    <span className="relative block aspect-[3/4] overflow-hidden bg-[var(--color-surface-muted)]">
                      {post.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.images[0].url}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                        />
                      ) : null}
                      <span
                        className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                        style={{ background: team ? TEAM_META[team].color : "#333" }}
                      >
                        {team ? TEAM_META[team].name : ""}
                      </span>
                      {post.mediaType === "video" ? (
                        <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">vidéo</span>
                      ) : null}
                    </span>
                    <span className="block p-2.5">
                      <span className="block text-[15px] font-semibold tabular-nums">{compactNumber(post.views)} vues</span>
                      <span className="block truncate text-[11.5px] text-[var(--color-ink-faint)]">
                        @{post.username} · {compactNumber(post.likes)} likes · {compactNumber(post.saves)} enreg.
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {manage}
    </div>
  );
}

function AccountRow({
  account,
  totals,
  color,
  teamName,
}: {
  account: SpyAccount;
  totals: Totals;
  color: string;
  teamName: string;
}) {
  return (
    <tr>
      <td className="px-4 py-2.5">
        <a
          href={`https://www.tiktok.com/@${account.username}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5"
        >
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatarUrl} alt="" className="size-8 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${color}` }} />
          ) : (
            <span className="grid size-8 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: color }}>
              {account.username.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold hover:underline">@{account.username}</span>
            <span className="block text-[11px] font-semibold" style={{ color }}>
              {teamName}
              {account.lastStatus === "error" ? (
                <span className="font-normal text-[var(--color-danger)]" title={account.lastError ?? undefined}>
                  {" · à vérifier"}
                </span>
              ) : null}
            </span>
          </span>
        </a>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{format(account.followers, "number")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{format(totals.followersGained, "delta")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{format(account.likesTotal, "number")}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{format(totals.views, "number")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{format(totals.saves, "number")}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{totals.posts}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{format(totals.avgViews, "number")}</td>
      <td className="px-4 py-2.5 text-right text-[11.5px] text-[var(--color-ink-faint)]">
        {account.lastCheckedAt ? relativeTime(account.lastCheckedAt) : "jamais"}
      </td>
    </tr>
  );
}

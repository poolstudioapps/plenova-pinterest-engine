"use client";

import { useState } from "react";
import { SpyComputers } from "@/components/spy/SpyComputers";
import { Badge, Button, Card, Input, Notice, Picker, RowMenu, RowMenuItem, type PickerOption } from "@/components/ui";
import { translator } from "@/lib/i18n";
import { compactNumber } from "@/lib/spy-format";
import type { SpyAccount, Team } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { TEAM_META } from "@/lib/versus-stats";

/**
 * The accounts the spy visits. Whatever is changed here, the spy follows on
 * its next pass, from whichever computer runs it - it reads this list from the
 * app every time.
 *
 * Two lists, never mixed: the competitors, on the Spy page ("competitors"),
 * and our own accounts with their team, on the Versus page ("ours"). Ours
 * never show on the Spy page - asked for by the user.
 */
export function SpyAccounts({
  accounts,
  onChange,
  mode,
}: {
  accounts: SpyAccount[];
  onChange: (update: (accounts: SpyAccount[]) => SpyAccount[]) => void;
  mode: "competitors" | "ours";
}) {
  const t = translator();
  const ours = mode === "ours";
  const [draft, setDraft] = useState("");
  const [draftTeam, setDraftTeam] = useState<Team>("stark");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const teamOptions: PickerOption[] = [
    { value: "stark", label: TEAM_META.stark.name },
    { value: "mousk", label: TEAM_META.mousk.name },
  ];

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/spy/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: draft, team: ours ? draftTeam : null }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        account?: SpyAccount;
        error?: { message?: string };
      };
      if (!res.ok || !data.account) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      const added = data.account;
      onChange((current) => [...current, added].sort((a, b) => a.username.localeCompare(b.username)));
      setDraft("");
      setInfo(t("spy.accountAdded", { name: added.username }));
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  async function patch(account: SpyAccount, body: { enabled?: boolean; note?: string; team?: Team }) {
    setError(null);
    // Shown at once; only these fields are put back if the server says no.
    onChange((current) => current.map((a) => (a.username === account.username ? { ...a, ...body } : a)));
    try {
      const res = await fetch(`/api/spy/accounts/${encodeURIComponent(account.username)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
    } catch {
      const before = Object.fromEntries(Object.keys(body).map((k) => [k, account[k as keyof SpyAccount]]));
      onChange((current) => current.map((a) => (a.username === account.username ? { ...a, ...before } : a)));
      setError(t("preview.requestFailed"));
    }
  }

  async function remove(account: SpyAccount) {
    setError(null);
    try {
      const res = await fetch(`/api/spy/accounts/${encodeURIComponent(account.username)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      onChange((current) => current.filter((a) => a.username !== account.username));
    } catch {
      setError(t("preview.requestFailed"));
    } finally {
      setConfirming(null);
    }
  }

  // Ours by team (Mr Stark, then Mr Mousk); competitors alphabetically.
  const listed = ours
    ? [...accounts].sort((a, b) =>
        a.team === b.team ? a.username.localeCompare(b.username) : a.team === "stark" ? -1 : 1,
      )
    : accounts;

  function row(account: SpyAccount) {
    const meta = account.team ? TEAM_META[account.team] : null;
    const ring = meta ? { boxShadow: `0 0 0 2px var(--color-surface), 0 0 0 4px ${meta.color}` } : undefined;
    return (
      <div
        key={account.username}
        className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !account.enabled && "opacity-60")}
      >
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" style={ring} />
        ) : (
          <span
            className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-surface-muted)] text-[14px] font-semibold text-[var(--color-ink-soft)]"
            style={ring}
          >
            {account.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-[180px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://www.tiktok.com/@${account.username}`}
              target="_blank"
              rel="noreferrer"
              className="text-[14px] font-semibold hover:underline"
            >
              @{account.username}
            </a>
            {account.displayName ? (
              <span className="truncate text-[12.5px] text-[var(--color-ink-faint)]">{account.displayName}</span>
            ) : null}
            {!account.enabled ? <Badge>{t("spy.paused")}</Badge> : null}
          </div>
          <p
            className={cn(
              "mt-0.5 text-[12px]",
              account.lastStatus === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-ink-faint)]",
            )}
          >
            {account.followers ? `${t("spy.followers", { n: compactNumber(account.followers) })} · ` : ""}
            {account.lastCheckedAt
              ? t("spy.checked", { when: relativeTime(account.lastCheckedAt) })
              : t("spy.neverChecked")}
            {account.lastStatus === "ok"
              ? ` · ${t(ours ? "spy.statusOkOurs" : "spy.statusOk", { n: account.lastFound ?? 0 })}`
              : account.lastStatus === "empty"
                ? ` · ${t(ours ? "spy.statusEmptyOurs" : "spy.statusEmpty")}`
                : account.lastStatus === "error"
                  ? ` · ${t("spy.statusError", { message: account.lastError ?? "?" })}`
                  : ""}
          </p>
        </div>
        <input
          defaultValue={account.note ?? ""}
          placeholder={t("spy.notePlaceholder")}
          aria-label={t("spy.notePlaceholder")}
          onBlur={(e) => {
            const note = e.target.value.trim();
            if (note !== (account.note ?? "")) void patch(account, { note });
          }}
          className="w-36 rounded-[9px] border border-transparent bg-transparent px-2 py-1 text-[12.5px] text-[var(--color-ink-soft)] outline-none transition-colors hover:border-[var(--color-line)] focus:border-[var(--color-accent)]"
        />
        {ours ? (
          <div className="w-36 shrink-0" title={t("spy.team")}>
            <Picker
              options={teamOptions}
              value={account.team ?? "stark"}
              onChange={(value) => void patch(account, { team: value as Team })}
            />
          </div>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void patch(account, { enabled: !account.enabled })}>
          {account.enabled ? t("spy.pause") : t("spy.resume")}
        </Button>
        <RowMenu label={t("hooks.more")} onClose={() => setConfirming(null)}>
          <RowMenuItem
            danger
            keepOpen={confirming !== account.username}
            onClick={() => {
              if (confirming === account.username) void remove(account);
              else setConfirming(account.username);
            }}
          >
            {confirming === account.username
              ? t("spy.confirmRemove")
              : t(ours ? "spy.removeAccountOurs" : "spy.removeAccount")}
          </RowMenuItem>
        </RowMenu>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
          {t(ours ? "spy.accountsHintOurs" : "spy.accountsHint")}
        </p>
        <form onSubmit={add} className="flex max-w-2xl flex-wrap gap-2">
          <div className="min-w-[220px] flex-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("spy.addPlaceholder")}
              aria-label={t("spy.addPlaceholder")}
            />
          </div>
          {ours ? (
            <div className="w-40" title={t("spy.team")}>
              <Picker options={teamOptions} value={draftTeam} onChange={(v) => setDraftTeam(v as Team)} />
            </div>
          ) : null}
          <Button type="submit" variant="primary" loading={busy} disabled={busy || draft.trim().length < 2}>
            {t("spy.addAccount")}
          </Button>
        </form>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {info ? <Notice tone="info">{info}</Notice> : null}
      </div>

      {listed.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-faint)]">{t("spy.accountsEmpty")}</p>
      ) : (
        <Card className="divide-y divide-[var(--color-line)]">{listed.map(row)}</Card>
      )}

      {ours ? null : (
        <div className="border-t border-[var(--color-line)] pt-5">
          <SpyComputers />
        </div>
      )}
    </div>
  );
}

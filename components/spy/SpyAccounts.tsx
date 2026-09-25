"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Notice, RowMenu, RowMenuItem } from "@/components/ui";
import { translator } from "@/lib/i18n";
import { compactNumber } from "@/lib/spy-format";
import type { SpyAccount } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

/**
 * The accounts the script visits. Whatever is changed here, the script follows
 * on its next pass - it reads this list from Supabase every time.
 */
export function SpyAccounts({
  accounts,
  onChange,
}: {
  accounts: SpyAccount[];
  onChange: (update: (accounts: SpyAccount[]) => SpyAccount[]) => void;
}) {
  const t = translator();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

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
        body: JSON.stringify({ username: draft }),
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

  async function patch(account: SpyAccount, body: { enabled?: boolean; note?: string }) {
    setError(null);
    // Shown at once; only this account is put back if the server says no.
    onChange((current) => current.map((a) => (a.username === account.username ? { ...a, ...body } : a)));
    try {
      const res = await fetch(`/api/spy/accounts/${encodeURIComponent(account.username)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
    } catch {
      onChange((current) => current.map((a) => (a.username === account.username ? account : a)));
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

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-[var(--color-ink-soft)]">{t("spy.accountsHint")}</p>

      <form onSubmit={add} className="flex max-w-xl gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("spy.addPlaceholder")}
          aria-label={t("spy.addPlaceholder")}
        />
        <Button type="submit" variant="primary" loading={busy} disabled={busy || draft.trim().length < 2}>
          {t("spy.addAccount")}
        </Button>
      </form>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {info ? <Notice tone="info">{info}</Notice> : null}

      {accounts.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-faint)]">{t("spy.accountsEmpty")}</p>
      ) : (
        <Card className="divide-y divide-[var(--color-line)]">
          {accounts.map((account) => (
            <div
              key={account.username}
              className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !account.enabled && "opacity-60")}
            >
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-surface-muted)] text-[14px] font-semibold text-[var(--color-ink-soft)]">
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
                    <span className="truncate text-[12.5px] text-[var(--color-ink-faint)]">
                      {account.displayName}
                    </span>
                  ) : null}
                  {!account.enabled ? <Badge>{t("spy.paused")}</Badge> : null}
                </div>
                <p
                  className={cn(
                    "mt-0.5 text-[12px]",
                    account.lastStatus === "error"
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-ink-faint)]",
                  )}
                >
                  {account.followers ? `${t("spy.followers", { n: compactNumber(account.followers) })} · ` : ""}
                  {account.lastCheckedAt
                    ? t("spy.checked", { when: relativeTime(account.lastCheckedAt) })
                    : t("spy.neverChecked")}
                  {account.lastStatus === "ok"
                    ? ` · ${t("spy.statusOk", { n: account.lastFound ?? 0 })}`
                    : account.lastStatus === "empty"
                      ? ` · ${t("spy.statusEmpty")}`
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
                className="w-40 rounded-[9px] border border-transparent bg-transparent px-2 py-1 text-[12.5px] text-[var(--color-ink-soft)] outline-none transition-colors hover:border-[var(--color-line)] focus:border-[var(--color-accent)]"
              />
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
                  {confirming === account.username ? t("spy.confirmRemove") : t("spy.removeAccount")}
                </RowMenuItem>
              </RowMenu>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

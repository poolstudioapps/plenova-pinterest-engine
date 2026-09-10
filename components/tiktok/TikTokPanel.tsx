"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, Notice, Select } from "@/components/ui";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
  type Locale,
} from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

export interface AccountView {
  openId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  language: ContentLocale;
  scopes: string[];
  canDirectPost: boolean;
  canDraft: boolean;
  connectedAt: string;
  expiresAt: string | null;
}

/**
 * Every connected TikTok account, each with the language it publishes in.
 *
 * The language belongs to the account rather than to a carousel: an account
 * always posts in the same language. Setting it once here means a multipost
 * never has to be told which account gets which version.
 */
export function TikTokPanel({
  uiLocale,
  configured,
  accounts,
}: {
  uiLocale: Locale;
  configured: boolean;
  accounts: AccountView[];
}) {
  const t = translator(uiLocale);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setLanguage(openId: string, language: ContentLocale) {
    setBusy(openId);
    setError(null);
    try {
      const res = await fetch("/api/tiktok/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openId, language }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(openId: string) {
    setBusy(openId);
    try {
      await fetch("/api/tiktok/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openId }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{t("tiktok.connection")}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
            {t("tiktok.connectBody")}
          </p>
        </div>
        {configured ? (
          <Button
            variant="primary"
            onClick={() => (location.href = "/api/tiktok/connect")}
          >
            {accounts.length > 0 ? t("tiktok.addAccount") : t("tiktok.connect")}
          </Button>
        ) : null}
      </div>

      {!configured ? (
        <div className="mt-4">
          <Notice tone="warn">{t("tiktok.notConfiguredBody")}</Notice>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-5 border-t border-[var(--color-line)] pt-5">
        {accounts.length === 0 ? (
          <EmptyState
            title={t("tiktok.noAccounts")}
            description={t("tiktok.noAccountsBody")}
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {accounts.map((account) => (
              <li
                key={account.openId}
                className="flex flex-wrap items-center gap-4 py-3.5"
              >
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.avatarUrl}
                    alt=""
                    className="size-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="size-10 shrink-0 rounded-full bg-[var(--color-surface-muted)]" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {account.username
                      ? `@${account.username}`
                      : account.displayName}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--color-ink-faint)]">
                    {t("pinterest.connectedAt")} {formatDate(account.connectedAt)}
                    {account.canDirectPost ? "" : ` · ${t("tiktok.noDirectPost")}`}
                  </p>
                </div>

                <div className="w-44 shrink-0">
                  <Select
                    aria-label={t("tiktok.language")}
                    value={account.language}
                    disabled={busy === account.openId}
                    onChange={(e) =>
                      void setLanguage(
                        account.openId,
                        e.target.value as ContentLocale,
                      )
                    }
                  >
                    {CONTENT_LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {CONTENT_LOCALE_LABELS[l]}
                      </option>
                    ))}
                  </Select>
                </div>

                <Badge className="uppercase">{account.language}</Badge>

                <Button
                  variant="ghost"
                  className="text-[var(--color-danger)]"
                  onClick={() => void disconnect(account.openId)}
                  loading={busy === account.openId}
                >
                  {t("tiktok.disconnect")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

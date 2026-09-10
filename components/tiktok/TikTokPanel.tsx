"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { translator, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

interface Status {
  configured: boolean;
  connected: boolean;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  canDirectPost: boolean;
  canDraft: boolean;
  connectedAt: string | null;
  expiresAt: string | null;
}

export function TikTokPanel({
  uiLocale,
  status,
}: {
  uiLocale: Locale;
  status: Status;
}) {
  const t = translator(uiLocale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/tiktok/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!status.connected) {
    return (
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">{t("tiktok.connection")}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
          {t("tiktok.connectBody")}
        </p>
        <div className="mt-5">
          {status.configured ? (
            <Button
              variant="primary"
              onClick={() => (location.href = "/api/tiktok/connect")}
            >
              {t("tiktok.connect")}
            </Button>
          ) : (
            <Notice tone="warn">{t("tiktok.notConfiguredBody")}</Notice>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {status.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={status.avatarUrl}
              alt=""
              className="size-11 rounded-full object-cover"
            />
          ) : (
            <div className="size-11 rounded-full bg-[var(--color-surface-muted)]" />
          )}
          <div>
            <h2 className="text-[15px] font-semibold">
              {status.username ? `@${status.username}` : status.displayName}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--color-ink-soft)]">
              {status.connectedAt
                ? `${t("pinterest.connectedAt")} ${formatDate(status.connectedAt)}`
                : ""}
            </p>
          </div>
        </div>

        <Button variant="secondary" onClick={disconnect} loading={busy}>
          {t("tiktok.disconnect")}
        </Button>
      </div>

      <div className="mt-5 space-y-2.5 border-t border-[var(--color-line)] pt-4 text-[13px]">
        {[
          { label: t("tiktok.directPost"), ok: status.canDirectPost },
          { label: t("tiktok.draft"), ok: status.canDraft },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-[var(--color-ink-soft)]">{row.label}</span>
            <span className="flex items-center gap-1.5 font-medium">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor: row.ok
                    ? "var(--color-accent)"
                    : "var(--color-ink-faint)",
                }}
              />
              {row.ok ? t("tiktok.available") : t("tiktok.unavailable")}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {status.scopes.map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
      </div>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, Notice, Spinner } from "@/components/ui";
import { translator, type Locale } from "@/lib/i18n";
import type { PinterestAccount, PinterestBoard } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface Props {
  uiLocale: Locale;
  mode: "oauth" | "manual" | "none";
  configured: boolean;
  initialConnected: boolean;
  account: PinterestAccount | null;
  scopes: string[];
  connectedAt: string | null;
  expiresAt: string | null;
  canPublish: boolean;
}

export function ConnectionPanel({
  uiLocale,
  mode,
  configured,
  initialConnected,
  account,
  scopes,
  connectedAt,
  expiresAt,
  canPublish,
}: Props) {
  const t = translator(uiLocale);
  const router = useRouter();
  const [boards, setBoards] = useState<PinterestBoard[] | null>(null);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!initialConnected) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/pinterest/boards");
        const data = (await res.json()) as
          | { boards: PinterestBoard[] }
          | { error: { message: string } };
        if (cancelled) return;

        if (!res.ok) {
          setBoardsError("error" in data ? data.error.message : "Could not load boards.");
          setBoards([]);
          return;
        }
        if ("boards" in data) setBoards(data.boards);
      } catch {
        if (!cancelled) {
          setBoardsError("Could not reach the server.");
          setBoards([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialConnected]);

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/pinterest/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  if (!initialConnected) {
    return (
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">{t("pinterest.connection")}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)]">
          {t("pinterest.connectBody")}
        </p>

        <div className="mt-5">
          {configured ? (
            <Button variant="primary" onClick={() => (location.href = "/api/pinterest/connect")}>
              {t("pinterest.connect")}
            </Button>
          ) : (
            <Notice tone="warn">
              {t("pinterest.notConfigured")}
            </Notice>
          )}
        </div>

        <div className="mt-5 border-t border-[var(--color-line)] pt-4">
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-faint)]">
            {t("pinterest.trialBody")}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">
            {account?.username
              ? `@${account.username}`
              : mode === "manual"
                ? t("pinterest.trialTitle")
                : t("pinterest.connectedTitle")}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">
            {connectedAt ? `${t("pinterest.connectedAt")} ${formatDate(connectedAt)}` : ""}
            {expiresAt ? ` · ${t("pinterest.expires")} ${formatDate(expiresAt)}` : ""}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {scopes.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
        </div>

        <Button variant="secondary" onClick={disconnect} loading={disconnecting}>
          {t("pinterest.disconnect")}
        </Button>
      </div>

      {!canPublish ? (
        <div className="mt-4">
          <Notice tone="warn">
            {mode === "manual"
              ? t("pinterest.trialBody")
              : t("pinterest.noHosting")}
          </Notice>
        </div>
      ) : null}

      <div className="mt-6 border-t border-[var(--color-line)] pt-5">
        <h3 className="mb-3 text-[14px] font-semibold">{t("pinterest.boards")}</h3>

        {boards === null ? (
          <div className="flex items-center gap-2 py-4 text-[13px] text-[var(--color-ink-soft)]">
            <Spinner /> {t("pinterest.loadingBoards")}
          </div>
        ) : boardsError ? (
          <Notice tone="danger">{boardsError}</Notice>
        ) : boards.length === 0 ? (
          <EmptyState
            title={t("pinterest.noBoards")}
            description={t("pinterest.noBoardsBody")}
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {boards.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{b.name}</p>
                  <p className="text-[12px] text-[var(--color-ink-faint)]">
                    {b.privacy ?? "public"}
                    {typeof b.pinCount === "number" ? ` · ${b.pinCount} pins` : ""}
                  </p>
                </div>
                <code className="shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                  {b.id}
                </code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

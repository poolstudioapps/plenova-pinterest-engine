"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Notice,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { translator, type Locale } from "@/lib/i18n";
import type { PinRecord, PinterestBoard } from "@/lib/types";

interface Props {
  pin: PinRecord | null;
  loading?: boolean;
  uiLocale: Locale;
  /** Called after any mutation so a parent list can refresh. */
  onChange?: (pin: PinRecord) => void;
}

interface ConnectionState {
  connected: boolean;
  canPublish: boolean;
}

/**
 * The Pin preview is the visual focus of the tool (spec §28). It doubles as the
 * editor: copy can be corrected before anything reaches Pinterest.
 */
export function PinPreview({ pin, loading, uiLocale, onChange }: Props) {
  const t = translator(uiLocale);

  const [draft, setDraft] = useState<PinRecord | null>(pin);
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [connection, setConnection] = useState<ConnectionState>({
    connected: false,
    canPublish: false,
  });
  const [busy, setBusy] = useState<null | "save" | "publish" | "queue">(null);
  const [message, setMessage] = useState<{
    tone: "info" | "danger";
    text: string;
  } | null>(null);

  useEffect(() => {
    setDraft(pin);
    setMessage(null);
  }, [pin]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/pinterest/status");
        if (!res.ok) return;
        const status = (await res.json()) as ConnectionState;
        if (cancelled) return;
        setConnection(status);

        if (status.connected) {
          const boardRes = await fetch("/api/pinterest/boards");
          if (!boardRes.ok || cancelled) return;
          const data = (await boardRes.json()) as { boards: PinterestBoard[] };
          setBoards(data.boards);
        }
      } catch {
        // Pinterest is optional; the preview stays fully usable without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<PinRecord>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  async function call(
    action: "save" | "publish" | "queue",
    url: string,
    body: unknown,
  ) {
    if (!draft) return;
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: action === "save" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // The publish route returns the record alongside a failure, and PinRecord
      // carries its own `error` field, so the two are read separately rather
      // than discriminated on key presence.
      const data = (await res.json()) as {
        pin?: PinRecord;
        error?: { code?: string; message?: string } | string | null;
      };

      if (!res.ok) {
        const apiError =
          data.error && typeof data.error === "object" ? data.error.message : null;
        setMessage({ tone: "danger", text: apiError ?? t("preview.requestFailed") });
        // A failed publish still returns the updated record - keep it in sync.
        if (data.pin) {
          setDraft(data.pin);
          onChange?.(data.pin);
        }
        return;
      }

      if (data.pin) {
        setDraft(data.pin);
        onChange?.(data.pin);
        setMessage({
          tone: "info",
          text:
            action === "publish"
              ? `${t("preview.publish")} — ${data.pin.pinterestPinId}`
              : action === "queue"
                ? t("preview.queued")
                : t("preview.saved"),
        });
      }
    } catch {
      setMessage({ tone: "danger", text: t("preview.unreachable") });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !draft) {
    return (
      <Card className="grid place-items-center p-5">
        <div className="w-full max-w-sm">
          <div className="shimmer aspect-pin w-full rounded-[12px] bg-[var(--color-surface-muted)]" />
          <p className="mt-4 text-center text-[13px] text-[var(--color-ink-soft)]">
            {t("preview.working")}
          </p>
        </div>
      </Card>
    );
  }

  if (!draft) {
    return (
      <Card className="grid place-items-center p-10 text-center">
        <div className="max-w-xs">
          <div className="mx-auto aspect-pin w-40 rounded-[12px] border border-dashed border-[var(--color-line-strong)]" />
          <p className="mt-5 text-[14px] font-medium">{t("preview.empty")}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
            {t("preview.emptyBody")}
          </p>
        </div>
      </Card>
    );
  }

  const boardSelected = Boolean(draft.boardId);

  return (
    <Card className="p-5">
      <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div>
          {draft.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.imageUrl}
              alt={draft.altText}
              className="aspect-pin w-full rounded-[12px] border border-[var(--color-line)] object-cover"
            />
          ) : (
            <div className="aspect-pin w-full rounded-[12px] bg-[var(--color-surface-muted)]" />
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <StatusBadge status={draft.status} />
            <Badge className="uppercase">{draft.locale}</Badge>
            <Badge>{draft.visualStyle.replace(/-/g, " ")}</Badge>
            <Badge>#{draft.variation}</Badge>
          </div>

          {draft.imageIsInline ? (
            <div className="mt-3">
              <Notice tone="warn">{t("preview.inline")}</Notice>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <Field
            label={t("preview.titleField")}
            htmlFor="pin-title"
            hint={`${draft.title.length}/100`}
          >
            <Input
              id="pin-title"
              value={draft.title}
              maxLength={100}
              onChange={(e) => update({ title: e.target.value })}
            />
          </Field>

          <Field
            label={t("preview.descField")}
            htmlFor="pin-desc"
            hint={`${draft.description.length}/800`}
          >
            <Textarea
              id="pin-desc"
              rows={5}
              maxLength={800}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-[13px] font-medium">{t("preview.keywords")}</p>
            <div className="flex flex-wrap gap-1.5">
              {draft.keywords.map((k) => (
                <Badge key={k}>{k}</Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium">
              {t("preview.destination")}
            </p>
            <a
              href={draft.link}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[12.5px] break-all text-[var(--color-accent)] hover:underline"
            >
              {draft.link}
            </a>
          </div>

          <Field label={t("preview.board")} htmlFor="pin-board">
            <select
              id="pin-board"
              value={draft.boardId ?? ""}
              disabled={!connection.connected}
              onChange={(e) => {
                const board = boards.find((b) => b.id === e.target.value);
                update({
                  boardId: board?.id ?? null,
                  boardName: board?.name ?? null,
                });
              }}
              className="w-full rounded-[10px] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-[14px] disabled:opacity-50"
            >
              <option value="">
                {connection.connected
                  ? t("preview.selectBoard")
                  : t("preview.connectFirst")}
              </option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={() =>
                call("save", `/api/pins/${draft.id}`, {
                  title: draft.title,
                  description: draft.description,
                  boardId: draft.boardId,
                  boardName: draft.boardName,
                })
              }
              loading={busy === "save"}
            >
              {t("preview.save")}
            </Button>

            <Button
              onClick={() =>
                call("queue", "/api/queue", {
                  pinId: draft.id,
                  boardId: draft.boardId ?? undefined,
                  boardName: draft.boardName ?? undefined,
                })
              }
              loading={busy === "queue"}
              disabled={!boardSelected || draft.imageIsInline}
            >
              {t("preview.queue")}
            </Button>

            <Button
              variant="primary"
              onClick={() =>
                call("publish", "/api/pinterest/publish", {
                  pinId: draft.id,
                  boardId: draft.boardId,
                  boardName: draft.boardName ?? undefined,
                })
              }
              loading={busy === "publish"}
              disabled={
                !connection.canPublish || !boardSelected || draft.imageIsInline
              }
            >
              {t("preview.publish")}
            </Button>
          </div>

          {!connection.connected ? (
            <Notice tone="info">{t("preview.notConnected")}</Notice>
          ) : null}

          {message ? (
            <Notice tone={message.tone === "danger" ? "danger" : "info"}>
              {message.text}
            </Notice>
          ) : null}

          {draft.error ? (
            <Notice tone="danger" title={t("preview.lastError")}>
              {draft.error}
            </Notice>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

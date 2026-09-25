"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Notice, RowMenu, RowMenuItem } from "@/components/ui";
import { translator } from "@/lib/i18n";
import type { SpyAgent } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

/**
 * The computers allowed to run the spy. Each one gets its own access code,
 * shown once when it is created - the database keeps only its fingerprint -
 * so one computer can be cut off without re-issuing the others.
 */
export function SpyComputers() {
  const t = translator();
  const [agents, setAgents] = useState<SpyAgent[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/spy/agents")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: { agents: SpyAgent[] }) => {
        if (live) setAgents(data.agents);
      })
      .catch(() => {
        if (live) {
          setAgents([]);
          setError(t("preview.requestFailed"));
        }
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    setIssued(null);
    setCopied(false);
    try {
      const res = await fetch("/api/spy/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        agent?: SpyAgent;
        token?: string;
        error?: { message?: string };
      };
      if (!res.ok || !data.agent || !data.token) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      const agent = data.agent;
      setAgents((current) => [agent, ...(current ?? [])]);
      setIssued({ name: agent.name, token: data.token });
      setName("");
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(agent: SpyAgent) {
    setError(null);
    try {
      const res = await fetch(`/api/spy/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const at = new Date().toISOString();
      setAgents((current) => (current ?? []).map((a) => (a.id === agent.id ? { ...a, revokedAt: at } : a)));
    } catch {
      setError(t("preview.requestFailed"));
    } finally {
      setConfirming(null);
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // Working computers first, the revoked ones kept below for the record.
  const sorted = [...(agents ?? [])].sort(
    (a, b) => Number(Boolean(a.revokedAt)) - Number(Boolean(b.revokedAt)),
  );

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[14px] font-semibold">{t("spy.computers")}</h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">{t("spy.computersHint")}</p>
      </div>

      <form onSubmit={create} className="flex max-w-xl gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("spy.computerPlaceholder")}
          aria-label={t("spy.computerPlaceholder")}
          maxLength={60}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={busy}
          disabled={busy || !name.trim()}
          className="shrink-0 whitespace-nowrap"
        >
          {t("spy.computerAdd")}
        </Button>
      </form>

      {issued ? (
        <Notice tone="warn" title={t("spy.computerToken", { name: issued.name })}>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-[8px] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-[12.5px] break-all text-[var(--color-ink)] select-all">
              {issued.token}
            </code>
            <Button size="sm" variant="secondary" onClick={() => void copy(issued.token)}>
              {copied ? t("spy.copied") : t("spy.copy")}
            </Button>
          </div>
          <p className="mt-1.5">{t("spy.computerTokenHint")}</p>
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {agents === null ? null : sorted.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-faint)]">{t("spy.computersEmpty")}</p>
      ) : (
        <Card className="divide-y divide-[var(--color-line)]">
          {sorted.map((agent) => (
            <div
              key={agent.id}
              className={cn("flex items-center gap-3 px-4 py-2.5", agent.revokedAt && "opacity-55")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold">{agent.name}</span>
                  {agent.revokedAt ? <Badge>{t("spy.computerRevoked")}</Badge> : null}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[var(--color-ink-faint)]">
                  {agent.lastSeenAt
                    ? t("spy.computerSeen", { when: relativeTime(agent.lastSeenAt) })
                    : t("spy.computerNever")}
                  {agent.lastHost ? ` · ${agent.lastHost}` : ""}
                </p>
              </div>
              {agent.revokedAt ? null : (
                <RowMenu label={t("hooks.more")} onClose={() => setConfirming(null)}>
                  <RowMenuItem
                    danger
                    keepOpen={confirming !== agent.id}
                    onClick={() => {
                      if (confirming === agent.id) void revoke(agent);
                      else setConfirming(agent.id);
                    }}
                  >
                    {confirming === agent.id ? t("spy.confirmRemove") : t("spy.computerRevoke")}
                  </RowMenuItem>
                </RowMenu>
              )}
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

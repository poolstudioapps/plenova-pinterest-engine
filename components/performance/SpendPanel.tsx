"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Megaphone } from "@phosphor-icons/react";
import { Button, Card, Input, Notice, Select } from "@/components/ui";
import type { PerfSpendEntry } from "@/lib/performance/compute";

const CHANNELS = [
  "TikTok Ads",
  "Meta Ads",
  "Apple Search Ads",
  "Google Ads",
  "Influence",
  "Autre",
];

const money = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
const date = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Ad spend typed in by hand, for the channels AppsFlyer has no cost from
 * (Meta's comes through AppsFlyer). Folded away until needed.
 */
export function SpendPanel({
  entries,
  today,
  appsflyerHasCost,
}: {
  entries: PerfSpendEntry[];
  today: string;
  appsflyerHasCost: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setError(null);
    try {
      const res = await fetch("/api/performance/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, channel, amount, note }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => null))?.error?.message ??
            "Enregistrement impossible.",
        );
      setAmount("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enregistrement impossible.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(entry: PerfSpendEntry) {
    if (!window.confirm(`Supprimer ${money(entry.amount)} ${entry.channel} ?`))
      return;
    setBusy(entry.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/performance/spend?id=${encodeURIComponent(entry.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => null))?.error?.message ??
            "Suppression impossible.",
        );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-[16.5px] font-semibold tracking-[-0.015em]">
            <span className="grid size-8 place-items-center rounded-[10px] bg-[var(--color-surface-muted)] text-[var(--color-accent-ink)]">
              <Megaphone aria-hidden size={17} weight="duotone" />
            </span>
            Dépenses publicitaires
          </h2>
          <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
            Les coûts Meta arrivent seuls par AppsFlyer. Ajoute ici ce
            qu&apos;il ne voit pas (influence, autre régie…).
            {entries.length > 0
              ? ` ${entries.length} saisie${entries.length > 1 ? "s" : ""}, réparties jour par jour sur leur période.`
              : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant={open ? "ghost" : "secondary"}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Fermer" : "Ajouter une dépense"}
        </Button>
      </div>

      {open ? (
        <form
          onSubmit={add}
          className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--color-line)] pt-4 sm:grid-cols-2 lg:grid-cols-6"
        >
          <label className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">
            Du
            <Input
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              required
              className="mt-1 w-full"
            />
          </label>
          <label className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">
            Au
            <Input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              required
              className="mt-1 w-full"
            />
          </label>
          <label className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">
            Canal
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="mt-1 w-full"
            >
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </label>
          <label className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">
            Montant (€)
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
              required
              className="mt-1 w-full"
            />
          </label>
          <label className="text-[12.5px] font-medium text-[var(--color-ink-soft)]">
            Note
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Campagne…"
              maxLength={200}
              className="mt-1 w-full"
            />
          </label>
          <div className="flex items-end">
            <Button
              type="submit"
              variant="primary"
              loading={busy === "add"}
              className="w-full"
            >
              Enregistrer
            </Button>
          </div>
          <div className="sm:col-span-2 lg:col-span-6">
            <Notice tone={appsflyerHasCost ? "warn" : "info"}>
              Ne saisis pas une dépense qu&apos;AppsFlyer remonte déjà (Meta) :
              elle compterait deux fois.
            </Notice>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-4 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-[13px]"
            >
              <span className="w-[110px] font-semibold tabular-nums">
                {money(e.amount)}
              </span>
              <span className="font-medium">{e.channel}</span>
              <span className="text-[var(--color-ink-soft)]">
                {e.from === e.to
                  ? date(e.from)
                  : `${date(e.from)} → ${date(e.to)}`}
              </span>
              {e.note ? (
                <span className="min-w-0 flex-1 truncate text-[var(--color-ink-faint)]">
                  {e.note}
                </span>
              ) : (
                <span className="flex-1" />
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(e)}
                loading={busy === e.id}
              >
                Supprimer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

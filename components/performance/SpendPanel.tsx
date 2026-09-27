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

const PLATFORMS = [
  { id: "", label: "Les deux" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
] as const;

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
 * Ad spend typed in by hand, for what AppsFlyer does not bring: the networks
 * linked to it (Meta...) arrive by themselves once its aggregate report can
 * be read (lib/performance/appsflyer.ts). The store a campaign targeted feeds
 * the AppsFlyer section's costs per store. Folded away until needed.
 */
export function SpendPanel({
  entries,
  today,
  appsflyerHasCost,
  appsflyerCost,
}: {
  entries: PerfSpendEntry[];
  today: string;
  appsflyerHasCost: boolean;
  /** AppsFlyer's cost per day, to spot a typed entry it now also brings. */
  appsflyerCost: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [platform, setPlatform] = useState<"" | "ios" | "android">("");
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
        body: JSON.stringify({ from, to, channel, amount, platform, note }),
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

  // A Meta entry on days AppsFlyer now brings a cost for: likely counted twice.
  const overlaps = (e: PerfSpendEntry) =>
    /meta/i.test(e.channel) &&
    Object.entries(appsflyerCost).some(
      ([day, v]) => v > 0 && day >= e.from && day <= e.to,
    );

  async function remove(entry: PerfSpendEntry) {
    if (!window.confirm(`Supprimer la dépense ${entry.channel} de ${money(entry.amount)} ?`))
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
            Les coûts des régies reliées à AppsFlyer (Meta…) arrivent seuls.
            Saisis ici les autres, avec le store visé si la campagne n&apos;en
            cible qu&apos;un.
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
          className="mt-4 grid grid-cols-1 gap-3 border-t border-[var(--color-line)] pt-4 sm:grid-cols-2 lg:grid-cols-4"
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
            Store visé
            <Select
              value={platform}
              onChange={(e) =>
                setPlatform(e.target.value as "" | "ios" | "android")
              }
              className="mt-1 w-full"
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
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
          <label className="text-[12.5px] font-medium text-[var(--color-ink-soft)] lg:col-span-2">
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
          <div className="sm:col-span-2 lg:col-span-4">
            <Notice tone={appsflyerHasCost || /meta/i.test(channel ?? "") ? "warn" : "info"}>
              {appsflyerHasCost
                ? "AppsFlyer remonte déjà des coûts (Meta…) : ne saisis pas une dépense qu'il voit, elle compterait deux fois."
                : "Si tu saisis une dépense Meta ici, supprime-la quand AppsFlyer remontera ses coûts (elle sera signalée) : sinon elle comptera deux fois."}
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
              <span className="font-medium">
                {e.channel}
                {e.platform ? (
                  <span className="ml-1.5 rounded-full bg-[var(--color-surface-muted)] px-1.5 py-px text-[11px] font-medium text-[var(--color-ink-soft)]">
                    {e.platform === "ios" ? "iOS" : "Android"}
                  </span>
                ) : null}
                {overlaps(e) ? (
                  <span
                    className="ml-1.5 rounded-full bg-[var(--color-warn-soft)] px-1.5 py-px text-[11px] font-medium text-[var(--color-warn-ink)]"
                    title="AppsFlyer remonte déjà des coûts sur ces jours : cette saisie les compte une deuxième fois"
                  >
                    comptée deux fois ?
                  </span>
                ) : null}
              </span>
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

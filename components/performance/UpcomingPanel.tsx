"use client";

import type { LtvInputs, Upcoming } from "@/lib/performance/ltv";
import { cn } from "@/lib/utils";
import { TILE, TILE_LABEL, TILE_VALUE } from "@/components/ui";

const eur0 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const whole = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * How the period ends split up, as one bar: renewing (the green of things
 * going right), cancelled (red), stuck on payment (amber). Each part is also
 * written out above it, so the colours are a picture of the numbers, never
 * the only way to read them.
 */
function Split({ renew, cancel, billing }: { renew: number; cancel: number; billing: number }) {
  const total = renew + cancel + billing;
  if (total <= 0) return null;
  const parts = [
    { value: renew, color: "var(--color-accent)" },
    { value: billing, color: "var(--color-warn)" },
    { value: cancel, color: "var(--color-danger)" },
  ].filter((part) => part.value > 0);
  return (
    <div aria-hidden className="mt-auto pt-3.5">
      <div className="flex h-1.5 gap-0.5">
        {parts.map((part, i) => (
          <span
            key={i}
            className="grow-x-in h-full min-w-1.5 rounded-full"
            style={{ flexGrow: part.value, background: part.color, ["--i" as string]: i }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Subscriptions coming to the end of their period in the next days: how many
 * are set to renew, set to cancel, in billing trouble, and what the renewals
 * should bring. RevenueCat gives the month of expiration, not the day, so a
 * month only partly in the window is counted by its share of days.
 */
export function UpcomingPanel({
  upcoming,
  inputs,
}: {
  upcoming: Upcoming;
  inputs: LtvInputs;
}) {
  const approx = upcoming.estimated ? "≈ " : "";
  const n = (x: number) => `${approx}${whole.format(x)}`;
  const nextAnnual = (inputs.expirations ?? [])
    .filter(
      (e) =>
        e.plan === "P1Y" &&
        e.active > 0 &&
        e.month >= upcoming.from.slice(0, 7),
    )
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  const annualInWindow = upcoming.plans.some(
    (p) => p.plan === "P1Y" && p.ending >= 0.5,
  );

  return (
    <div className="space-y-2.5">
      {upcoming.plans.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink-soft)]">
          Aucune fin de période prévue sur ces jours.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {upcoming.plans.map((p) => (
            <div key={p.plan} className={TILE}>
              <p className={TILE_LABEL}>
                {p.label} · {n(p.ending)} fin{p.ending >= 1.5 ? "s" : ""} de
                période
              </p>
              <p className={cn(TILE_VALUE, "mt-3")}>
                {n(p.renew)}{" "}
                <span className="text-[12px] font-medium tracking-normal text-[var(--color-ink-soft)]">
                  renouvellement{p.renew >= 1.5 ? "s" : ""}
                </span>
              </p>
              <p className="figures mt-1.5 text-[12.5px] text-[var(--color-ink-soft)]">
                {n(p.cancel)} résiliation{p.cancel >= 1.5 ? "s" : ""}
                {p.billing >= 0.5
                  ? ` · ${n(p.billing)} en échec de paiement`
                  : ""}
              </p>
              <p className="mt-1 text-[11.5px] tabular-nums text-[var(--color-ink-faint)]">
                {approx}
                {eur0.format(p.net)} net attendus ({eur0.format(p.gross)} brut)
              </p>
              <Split renew={p.renew} cancel={p.cancel} billing={p.billing} />
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
        Du {day(upcoming.from)} au {day(upcoming.to)} inclus. Renouvellement =
        abonnement encore en renouvellement automatique ; résiliation =
        renouvellement coupé par l&apos;abonné. RevenueCat donne le mois de fin
        de période, pas le jour :
        {upcoming.estimated
          ? " les fins de mois entièrement dans la fenêtre comptent en entier, un mois seulement entamé au prorata de ses jours (≈)."
          : " les chiffres couvrent des mois entiers."}
        {!annualInWindow && nextAnnual
          ? ` Annuels : aucune échéance sur ces jours, les premières en ${monthLabel(nextAnnual.month)} (${whole.format(nextAnnual.active)}).`
          : ""}
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TILE, TILE_LABEL, TILE_VALUE } from "@/components/ui";
import {
  CREDIBILITY,
  FLOOR,
  HORIZONS,
  type Horizon,
  type LtvProjection,
  type SubscriberEngagement,
} from "@/lib/performance/ltv";

const eur2 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const eur1 = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const money = (n: number | null) => (n === null ? "-" : eur2.format(n));
// Units stay on their number's line: no-break spaces before € and %.
const range = ([a, b]: [number, number]) =>
  `${eur1.format(a)}–${eur1.format(b)} €`;
const pct = (n: number | null, digits = 1) =>
  n === null
    ? "-"
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n * 100)} %`;
const count = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const dec = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
const horizonLabel = (h: Horizon) => (h === 12 ? "1 an" : `${h} mois`);
const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "long",
    timeZone: "UTC",
  });

function LtvTile({
  label,
  net,
  gross,
  sub,
}: {
  label: string;
  net: number | null;
  gross: number | null;
  sub: string;
}) {
  return (
    <div className={TILE}>
      <p className={cn(TILE_LABEL, "min-h-[2lh]")}>{label}</p>
      <p className={cn(TILE_VALUE, "mt-1.5")}>
        {money(net)}{" "}
        <span className="text-[12px] font-medium tracking-normal text-[var(--color-ink-soft)]">
          net
        </span>
      </p>
      <p className="figures mt-2 text-[12.5px] font-medium text-[var(--color-ink-soft)]">
        {money(gross)} brut
      </p>
      <p className="mt-auto pt-2 text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
        {sub}
      </p>
    </div>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[12px] border border-[color-mix(in_oklab,var(--color-warn)_16%,transparent)] bg-[var(--color-warn-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-warn-ink)]">
      {children}
    </p>
  );
}

/** Monthly subscribers still paying, month by month: measured bars full, projected ones hatched. */
function SurvivalBars({ ltv }: { ltv: LtvProjection }) {
  const rows = ltv.monthly.survival;
  return (
    <div>
      <p className="mb-2 text-[12.5px] font-medium text-[var(--color-ink)]">
        Abonnés mensuels qui paient encore, mois après mois
      </p>
      {/* One grid for labels, bars and months, the bars in a box of their
          own height: 100 % is the full box, whatever the label above. */}
      <div
        className="grid grid-cols-12 gap-1.5"
        role="img"
        aria-label="Part des abonnés mensuels qui paient encore, par mois"
      >
        {rows.map((r, i) => (
          <div key={r.m} className="flex min-w-0 flex-col items-center">
            <span className="h-[14px] text-[10.5px] leading-[14px] tabular-nums text-[var(--color-ink-faint)]">
              {Math.round(r.value * 100)}
            </span>
            <div className="mt-1 flex h-[78px] w-full items-end">
              <div
                className="grow-in w-full rounded-t-[4px]"
                title={
                  r.m === 0
                    ? "Mois 0 : 100 % (premier paiement)"
                    : r.measured
                      ? `Mois ${r.m} : ${Math.round(r.value * 100)} % paient encore (mesuré sur ${count(r.atRisk)} abonnés)`
                      : `Mois ${r.m} : ${Math.round(r.value * 100)} % (projeté)`
                }
                style={{
                  ["--i" as string]: i,
                  height: `${Math.max(2, r.value * 100)}%`,
                  background: r.measured
                    ? "var(--color-accent)"
                    : "repeating-linear-gradient(135deg, var(--color-accent) 0 2px, transparent 2px 5px)",
                  border: r.measured
                    ? undefined
                    : "1px solid var(--color-accent)",
                }}
              />
            </div>
            <span className="mt-1 text-[10.5px] text-[var(--color-ink-faint)]">
              M{r.m}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-4 text-[11.5px] text-[var(--color-ink-faint)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[2px] bg-[var(--color-accent)]"
          />{" "}
          mesuré
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[2px] border border-[var(--color-accent)]"
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--color-accent) 0 1px, transparent 1px 3px)",
            }}
          />{" "}
          projeté à {pct(ltv.monthly.cruise, 0)} / mois
        </span>
      </p>
    </div>
  );
}

/**
 * LTV per paying customer: projected at 6 months and 1 year, and realized
 * since launch (lib/performance/ltv.ts). Net first (what the stores pay out),
 * then gross; one global number each - not per cohort, the owners' rule -
 * with an 80 % band and the assumptions one click away. Amplitude's usage of
 * subscribers is shown beside it, outside the euro figures.
 */
export function LtvPanel({
  ltv,
  engagement,
  lead,
}: {
  ltv: LtvProjection;
  engagement: SubscriberEngagement | null;
  /** A tile placed first in the same row (the page's ARPPU), so it does not sit alone above. */
  lead?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const mix = ltv.plans
    .map((p) => `${pct(p.weight)} ${p.label.toLowerCase()}`)
    .join(" · ");
  const hasOneTime = ltv.plans.some((p) => p.oneTime);
  const monthly = ltv.plans.find((p) => p.duration === "P1M");
  const annual = ltv.plans.find((p) => p.duration === "P1Y");

  return (
    <div className="space-y-4">
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", lead ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        {lead}
        {HORIZONS.map((h) => (
          <LtvTile
            key={h}
            label={`LTV par payeur · ${horizonLabel(h)}`}
            net={ltv.net[h]}
            gross={ltv.gross[h]}
            sub={`projetée · fourchette ${range(ltv.band.net[h])} net (${range(ltv.band.gross[h])} brut)`}
          />
        ))}
        <LtvTile
          label="LTV réalisée depuis le lancement"
          net={ltv.realized.net}
          gross={ltv.realized.gross}
          sub={`${count(ltv.realized.payers)} payeurs · clients récents et anciens mélangés, pas comparable terme à terme`}
        />
      </div>

      <div className="space-y-1.5 text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
        <p>
          À comparer au coût d&apos;acquisition d&apos;un <b>client payant</b>{" "}
          (pas d&apos;une installation). Repère prudent : rester sous le bas de
          la fourchette nette ({eur1.format(ltv.band.net[6][0])} € sur 6 mois,{" "}
          {eur1.format(ltv.band.net[12][0])} € sur 1 an).
        </p>
        <p>
          Répartition des premiers achats : {mix}
          {hasOneTime ? "" : " · 0 % achat unique"}.
        </p>
        {monthly ? (
          <p>
            Mensuel : {pct(ltv.monthly.firstRenewal.rate)} renouvellent après le
            1er mois ({count(ltv.monthly.firstRenewal.atRisk)} abonnés), puis
            environ {pct(ltv.monthly.cruise, 0)} restent d&apos;un mois sur
            l&apos;autre ({count(ltv.monthly.cruiseBasis.atRisk)} abonnés-mois
            observés).
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11.5px] font-medium">
            Part projetée : {pct(ltv.projectedShare[6])} (6 mois) ·{" "}
            {pct(ltv.projectedShare[12], 0)} (1 an)
          </span>
          {ltv.check ? (
            <span className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11.5px] font-medium">
              Contrôle : calculé sans {monthName(ltv.check.month)}, le modèle
              prévoyait {Math.round(ltv.check.predicted)} renouvellements
              mensuels ; il y en a eu {count(ltv.check.observed)}
              {ltv.check.outOfRange ? "" : " (écart normal)"}
            </span>
          ) : null}
        </div>
      </div>

      {ltv.flags.insufficient ? (
        <Flag>
          Données insuffisantes : trop peu d&apos;abonnés mensuels observés, une
          valeur de référence est utilisée.
        </Flag>
      ) : null}
      {ltv.check?.outOfRange ? (
        <Flag>
          Contrôle hors marge : le mois dernier, le modèle s&apos;est trompé
          plus que d&apos;habitude. Chiffre à prendre avec prudence.
        </Flag>
      ) : null}
      {ltv.drift ? (
        <Flag>
          Tendance à surveiller : les derniers abonnés mensuels renouvellent{" "}
          {ltv.drift.direction === "up" ? "plus" : "moins"} souvent leur 1er
          mois que les premiers
          {ltv.drift.status === "contradicted"
            ? ", mais le mois en cours le contredit"
            : ltv.drift.status === "confirmed"
              ? ", et le mois en cours va dans le même sens"
              : ", à confirmer"}
          . Le chiffre ne l&apos;intègre pas ; la fourchette est élargie.
        </Flag>
      ) : null}
      {ltv.flags.capped ? (
        <Flag>
          Limite atteinte : le rythme de croisière a été plafonné par la part
          des abonnés en renouvellement automatique.
        </Flag>
      ) : null}
      {ltv.flags.clamped ? (
        <Flag>Limite atteinte : un taux extrême a été plafonné.</Flag>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {monthly ? <SurvivalBars ltv={ltv} /> : null}
        <div className="rounded-[16px] border border-[var(--color-edge)] bg-[var(--color-canvas)] px-4 py-3.5 text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
          <p className="mb-1 font-medium text-[var(--color-ink)]">
            Usage des abonnés (Amplitude)
          </p>
          {engagement ? (
            <>
              {(
                [
                  ["Mensuels encore actifs dans l'app", engagement.monthly],
                  ["Annuels encore actifs", engagement.annual],
                ] as const
              ).map(([label, v]) => {
                // Only the months measured on enough subscribers.
                const parts = [
                  v.month1 !== null ? `${pct(v.month1, 0)} au mois 1` : null,
                  v.month3 !== null ? `${pct(v.month3, 0)} au mois 3` : null,
                ].filter(Boolean);
                return (
                  <p key={label}>
                    {label}
                    {" "}:{" "}
                    {parts.length > 0
                      ? parts.join(" · ")
                      : "pas encore assez d'abonnés"}
                  </p>
                );
              })}
              {engagement.payingActive.length > 0 ? (
                <p>
                  Parmi les mensuels qui paient encore, part qui ouvre encore
                  l&apos;app :{" "}
                  {engagement.payingActive
                    .map((a) => `${pct(a.share, 0)} (mois ${a.month})`)
                    .join(" · ")}
                </p>
              ) : null}
              <p className="mt-1 text-[11.5px] text-[var(--color-ink-faint)]">
                Indicateur d&apos;engagement : n&apos;entre pas dans le calcul
                de la LTV (Amplitude ne voit pas les paiements, et un abonné qui
                n&apos;ouvre plus l&apos;app peut continuer de payer).
              </p>
            </>
          ) : (
            <p className="text-[var(--color-ink-faint)]">
              Pas encore relevé, ou indisponible : l&apos;indicateur est masqué
              (la LTV n&apos;est pas affectée).
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="text-[12.5px] font-medium text-[var(--color-accent)] hover:underline"
      >
        {open ? "Masquer les hypothèses" : "Voir les hypothèses"}
      </button>

      {open ? (
        <div className="space-y-3 rounded-[16px] border border-[var(--color-edge)] bg-[var(--color-canvas)] px-4 py-3.5 text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
          <p>
            <b>Ce que c&apos;est :</b> ce qu&apos;un client payant rapporte en
            moyenne pendant les 6 ou les 12 mois qui suivent son premier achat
            (paiements des mois 0 à 5, ou 0 à 11). Un seul chiffre pour tous les
            payeurs, pondéré par le type de premier achat. App Store et Play
            Store uniquement.
          </p>
          <p>
            <b>Net et brut :</b> brut = prix payé par le client, TVA comprise.
            Net = ce qui revient à Plenova après TVA et commission de 15 % des
            stores (Small Business, App Store et Play Store). Les remboursements
            sont déjà déduits des deux.
          </p>

          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] tabular-nums">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11.5px] text-[var(--color-ink-faint)]">
                  <th className="py-1.5 pr-3 font-medium">Offre</th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    Part des 1ers achats
                  </th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    1er paiement
                  </th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    Renouvellement
                  </th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    Net / brut
                  </th>
                  {HORIZONS.map((h) => (
                    <th key={h} className="py-1.5 pr-3 text-right font-medium">
                      {horizonLabel(h)} (paiements · brut)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ltv.plans.map((p) => (
                  <tr
                    key={p.duration}
                    className="border-b border-[var(--color-line)] last:border-0"
                  >
                    <td className="py-1.5 pr-3 text-[var(--color-ink)]">
                      {p.label}
                      {p.note ? (
                        <span className="ml-1 text-[11px] text-[var(--color-ink-faint)]">
                          ({p.note})
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{pct(p.weight)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {money(p.firstPrice)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {money(p.renewalPrice)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {pct(p.netRatio, 0)}
                    </td>
                    {HORIZONS.map((h) => (
                      <td key={h} className="py-1.5 pr-3 text-right">
                        {dec(p.payments[h])} · {money(p.gross[h])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {monthly ? (
            <p>
              <b>Mensuel :</b> RevenueCat mesure, sur les mois terminés
              uniquement, combien d&apos;abonnés renouvellent chaque mois, tous
              mois de démarrage confondus ({count(ltv.monthly.subscriptions)}{" "}
              abonnements mensuels). Un mois observé sur moins de {FLOOR}{" "}
              abonnés est ignoré ; un mois observé sur peu d&apos;abonnés est
              rapproché du rythme moyen (poids de {CREDIBILITY} abonnés).
              Au-delà des mois mesurés, on prolonge le rythme moyen observé
              après le 1er renouvellement, {pct(ltv.monthly.cruise, 0)} par mois
              : ni prudent ni optimiste par construction. La plupart des abonnés
              ont démarré au printemps et aucun hiver n&apos;a encore été
              observé.
            </p>
          ) : null}
          {annual ? (
            <p>
              <b>Annuel :</b> un seul paiement dans ces horizons ; son
              renouvellement tombe au 12e mois et n&apos;a encore jamais eu
              lieu, il n&apos;est pas compté.
              {ltv.annualSetToRenew !== null
                ? ` Aujourd'hui, ${pct(ltv.annualSetToRenew)} des annuels ont laissé le renouvellement automatique activé (indicateur seulement).`
                : ""}
            </p>
          ) : null}
          <p>
            <b>Achat unique :</b> un seul paiement, sans renouvellement
            {hasOneTime ? "." : " (pas encore de ventes)."}
          </p>
          <p>
            <b>Fourchette :</b> 80 % de chances, chaque taux pris au bas puis au
            haut de son intervalle en même temps (volontairement large). Le 1er
            renouvellement varie d&apos;une cohorte à l&apos;autre plus que le
            hasard : son intervalle est élargi d&apos;autant.
          </p>
          <p>
            <b>Réalisé :</b> revenu encaissé depuis le lancement ÷ clients
            payants. Il mélange des payeurs anciens et récents : il ne se
            compare pas terme à terme à la projection.
          </p>
          <p>
            Tout se recalcule à chaque relevé : plus l&apos;app vieillit, plus
            la projection repose sur du mesuré.
          </p>
        </div>
      ) : null}
    </div>
  );
}

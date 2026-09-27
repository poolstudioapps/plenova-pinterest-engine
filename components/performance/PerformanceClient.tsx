"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Button, Card, Input, Notice } from "@/components/ui";
import {
  chartPoints,
  cohortRows,
  kpis,
  presetRange,
  previousRange,
  type Kpis,
  type PerfPayload,
  type Preset,
  type Range,
} from "@/lib/performance/compute";
import type { RevenueOverview } from "@/lib/revenue";
import {
  projectLtv,
  subscriberEngagement,
  upcomingRenewals,
} from "@/lib/performance/ltv";
import { MIN_APP_VERSION } from "@/lib/performance/versions";
import { cn } from "@/lib/utils";
import { LineChart } from "./LineChart";
import { LtvPanel } from "./LtvPanel";
import { UpcomingPanel } from "./UpcomingPanel";
import { SpendPanel } from "./SpendPanel";

/* ------------------------------------------------------------ format -- */

const eur0 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eur2 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const int = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const money = (n: number | null) =>
  n === null ? "-" : Math.abs(n) >= 100 ? eur0.format(n) : eur2.format(n);
const count = (n: number | null) => (n === null ? "-" : int.format(n));
const pct = (n: number | null, digits = 1) =>
  n === null
    ? "-"
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n * 100)} %`;
const shortDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const longDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      })
    : "jamais";

/* ------------------------------------------------------------- tiles -- */

type Better = "up" | "down" | null;

function Delta({
  now,
  before,
  better,
}: {
  now: number | null;
  before: number | null;
  better: Better;
}) {
  if (now === null || before === null || before === 0) return null;
  const change = (now - before) / Math.abs(before);
  if (!Number.isFinite(change) || Math.abs(change) < 0.005) {
    return (
      <span className="text-[11.5px] text-[var(--color-ink-faint)]">
        stable
      </span>
    );
  }
  const good = better === null ? null : change > 0 === (better === "up");
  return (
    <span
      className={cn(
        "text-[11.5px] font-medium tabular-nums",
        good === null
          ? "text-[var(--color-ink-soft)]"
          : good
            ? "text-[var(--color-accent)]"
            : "text-[var(--color-danger)]",
      )}
      title="Par rapport à la période de même durée juste avant"
    >
      {change > 0 ? "▲" : "▼"}{" "}
      {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
        Math.abs(change) * 100,
      )}{" "}
      %
    </span>
  );
}

function Tile({
  label,
  value,
  sub,
  hint,
  now,
  before,
  better = "up",
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  hint?: string;
  now?: number | null;
  before?: number | null;
  better?: Better;
}) {
  return (
    <div
      className="rounded-[14px] bg-[var(--color-surface-muted)] px-3.5 py-3"
      title={hint}
    >
      <p className="text-[12px] font-medium text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.03em] tabular-nums">
        {value}
      </p>
      <div className="mt-1 flex min-h-[16px] flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--color-ink-faint)]">
        {sub ? <span className="tabular-nums">{sub}</span> : null}
        {now !== undefined && before !== undefined ? (
          <Delta now={now} before={before} better={better} />
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  source,
  children,
  missing,
}: {
  title: string;
  source: string;
  children: ReactNode;
  missing?: string | null;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        <span className="text-[12px] text-[var(--color-ink-faint)]">
          {source}
        </span>
      </div>
      {missing ? (
        <p className="text-[13px] text-[var(--color-ink-soft)]">{missing}</p>
      ) : (
        children
      )}
    </Card>
  );
}

const GRID = "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4";

/* -------------------------------------------------------------- page -- */

const PRESETS: { id: Preset; label: string }[] = [
  { id: "7", label: "7 j" },
  { id: "30", label: "30 j" },
  { id: "60", label: "60 j" },
  { id: "all", label: "Depuis le début" },
];

export type InitialRange = { preset: Preset } | { custom: Range };

export function PerformanceClient({
  payload,
  live,
  initial,
}: {
  payload: PerfPayload;
  live: RevenueOverview | null;
  initial: InitialRange;
}) {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset | null>(
    "preset" in initial ? initial.preset : null,
  );
  const [custom, setCustom] = useState<Range>(
    "custom" in initial
      ? initial.custom
      : presetRange("30", payload.today, payload.firstDay),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{
    tone: "info" | "danger";
    text: string;
  } | null>(null);

  // Keyed by the dates, so a new object for the same period computes nothing.
  const { from, to } = preset
    ? presetRange(preset, payload.today, payload.firstDay)
    : custom;
  const range = useMemo(() => ({ from, to }), [from, to]);
  const previous = useMemo(
    () => previousRange(range, payload.firstDay),
    [range, payload.firstDay],
  );

  const k = useMemo(() => kpis(payload, range), [payload, range]);
  const p: Kpis | null = useMemo(
    () => (previous ? kpis(payload, previous) : null),
    [payload, previous],
  );
  const chart = useMemo(() => chartPoints(payload, range), [payload, range]);
  const cohorts = useMemo(() => cohortRows(payload, range), [payload, range]);
  // One number for the whole history, whatever the period picked.
  const ltv = useMemo(
    () => (payload.rc?.ltvInputs ? projectLtv(payload.rc.ltvInputs) : null),
    [payload],
  );
  const engagement = useMemo(
    () =>
      subscriberEngagement(
        payload.subscriberUsage,
        payload.rc?.ltvInputs ?? null,
      ),
    [payload],
  );
  // The next 10 days from today, whatever the period picked.
  const upcoming = useMemo(
    () =>
      payload.rc?.ltvInputs
        ? upcomingRenewals(payload.rc.ltvInputs, payload.today, 10)
        : null,
    [payload],
  );

  // The user's rule: no spend in the period, no spend nor ROAS on screen.
  const spending = k.spend > 0;

  function pickPreset(id: Preset) {
    setPreset(id);
    window.history.replaceState(null, "", `?p=${id}`);
  }

  function pickDates(next: Range) {
    // Half-typed or impossible dates are ignored; the rest is kept within the data.
    const valid = (d: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
    if (!valid(next.from) || !valid(next.to)) return;
    const clamp = (d: string) =>
      d < payload.firstDay
        ? payload.firstDay
        : d > payload.today
          ? payload.today
          : d;
    const a = clamp(next.from);
    const b = clamp(next.to);
    const fixed = a <= b ? { from: a, to: b } : { from: b, to: a };
    setPreset(null);
    setCustom(fixed);
    window.history.replaceState(null, "", `?from=${fixed.from}&to=${fixed.to}`);
  }

  async function refresh() {
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const res = await fetch("/api/performance/refresh", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok)
        throw new Error(
          body?.error?.message ??
            (res.status === 504
              ? "Le relevé a pris trop de temps : ce qui était fini est enregistré, réessaie dans 15 min."
              : "Actualisation impossible."),
        );
      const failed = (body?.results ?? []).filter(
        (r: { status: string }) => r.status === "error",
      );
      setRefreshNote(
        failed.length
          ? {
              tone: "danger",
              text: `Relevé fait, sauf : ${failed.map((r: { source: string; error?: string }) => `${r.source} (${r.error ?? "erreur"})`).join(" ; ")}`,
            }
          : { tone: "info", text: "Données à jour." },
      );
      router.refresh();
    } catch (err) {
      setRefreshNote({
        tone: "danger",
        text: err instanceof Error ? err.message : "Actualisation impossible.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  const lastOk =
    payload.sources
      .map((s) => s.lastOk)
      .filter((d): d is string => d !== null)
      .sort()
      .pop() ?? null;
  const nothing = Object.keys(payload.series).length === 0;
  const status = (source: "revenuecat" | "amplitude" | "appsflyer") =>
    payload.sources.find((s) => s.source === source);
  const missing = (
    source: "revenuecat" | "amplitude" | "appsflyer",
    has: boolean,
  ) => {
    const s = status(source);
    if (!s?.configured)
      return `${s?.label ?? source} n'est pas encore branché (clé manquante dans Vercel).`;
    if (!s.lastOk)
      return `Pas encore de relevé ${s.label} : clique sur Actualiser.`;
    if (!has) return "Pas de données sur cette période.";
    return null;
  };
  const rcMissing = missing("revenuecat", k.has.revenuecat);
  const ampMissing = missing("amplitude", k.has.amplitude);
  // "Not read yet" is not zero: the 2.0.0+ series exist once a refresh made them.
  const conversionMeasured =
    payload.series["amplitude:new_users_v2"] !== undefined ||
    payload.series["revenuecat:conv_new_customers_v2"] !== undefined;
  const afMissing = missing("appsflyer", k.has.appsflyer);
  const lastFullMonth =
    payload.rc?.churnMonths.filter((m) => !m.incomplete).pop() ?? null;

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------- period bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Période"
            className="flex flex-wrap gap-1 rounded-full bg-[var(--color-surface-muted)] p-1"
          >
            {PRESETS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => pickPreset(x.id)}
                aria-pressed={preset === x.id}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  preset === x.id
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div
            className={cn(
              "flex max-w-full min-w-0 flex-wrap items-center gap-1.5 rounded-[18px] border px-2 py-1",
              preset === null
                ? "border-[var(--color-accent)]"
                : "border-[var(--color-line)]",
            )}
          >
            <Input
              type="date"
              aria-label="Du"
              value={range.from}
              min={payload.firstDay}
              max={payload.today}
              onChange={(e) =>
                pickDates({ from: e.target.value, to: range.to })
              }
              className="h-8 border-0 bg-transparent px-1.5 py-0 text-[13px] shadow-none"
            />
            <span className="text-[12px] text-[var(--color-ink-faint)]">→</span>
            <Input
              type="date"
              aria-label="Au"
              value={range.to}
              min={payload.firstDay}
              max={payload.today}
              onChange={(e) =>
                pickDates({ from: range.from, to: e.target.value })
              }
              className="h-8 border-0 bg-transparent px-1.5 py-0 text-[13px] shadow-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[var(--color-ink-faint)]">
            Relevé : {when(lastOk)} · auto à 9 h, 18 h, 22 h
          </span>
          <Button size="sm" onClick={refresh} loading={refreshing}>
            {refreshing ? "Relevé en cours…" : "Actualiser"}
          </Button>
        </div>
      </div>

      <p className="text-[12.5px] text-[var(--color-ink-soft)]">
        Du {longDay(range.from)} au {longDay(range.to)} ({k.days} j, jours UTC
        {range.to === payload.today ? ", aujourd'hui en cours" : ""})
        {previous
          ? ` · comparé au ${shortDay(previous.from)} → ${shortDay(previous.to)}`
          : ""}
      </p>

      {refreshNote ? (
        <Notice tone={refreshNote.tone}>{refreshNote.text}</Notice>
      ) : null}
      {nothing ? (
        <Notice tone="info" title="Aucune donnée pour l'instant">
          Les chiffres arrivent au premier relevé : une fois les clés ajoutées
          dans Vercel, clique sur Actualiser (1 à 2 min).
        </Notice>
      ) : null}

      {live ? (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[12px] border border-[var(--color-line)] px-4 py-2.5 text-[13px] text-[var(--color-ink-soft)]">
          <span className="font-semibold text-[var(--color-ink)]">
            En direct · RevenueCat
          </span>
          <span>
            MRR{" "}
            <b className="tabular-nums text-[var(--color-ink)]">
              {money(live.mrr)}
            </b>
          </span>
          <span>
            Abonnés actifs{" "}
            <b className="tabular-nums text-[var(--color-ink)]">
              {count(live.activeSubscriptions)}
            </b>
          </span>
          <span>
            Essais en cours{" "}
            <b className="tabular-nums text-[var(--color-ink)]">
              {count(live.activeTrials)}
            </b>
          </span>
          <span>
            Revenus 28 j{" "}
            <b className="tabular-nums text-[var(--color-ink)]">
              {money(live.revenue28)}
            </b>
          </span>
        </p>
      ) : null}

      {/* ------------------------------------------------------ revenue */}
      <Section
        title="Revenus"
        source="RevenueCat · brut TTC, remboursements déduits"
        missing={rcMissing}
      >
        <div className={GRID}>
          <Tile
            label="Revenu"
            value={money(k.revenue)}
            sub={`${count(k.transactions)} transactions`}
            now={k.revenue}
            before={p?.revenue ?? null}
          />
          <Tile
            label="MRR (fin de période)"
            value={money(k.mrr)}
            now={k.mrr}
            before={p?.mrr ?? null}
          />
          <Tile
            label="Abonnés actifs"
            value={count(k.activeSubscriptions)}
            now={k.activeSubscriptions}
            before={p?.activeSubscriptions ?? null}
          />
          <Tile
            label="Nouveaux clients"
            value={count(k.newCustomers)}
            now={k.newCustomers}
            before={p?.newCustomers ?? null}
            hint="Clients vus pour la première fois par RevenueCat"
          />
          <Tile
            label="Churn mensuel moyen"
            value={pct(k.churnRate)}
            sub={`${count(k.churned)} perdus sur la période`}
            hint="Abonnements payants perdus ÷ abonnements actifs moyens, ramené à 30 jours"
            now={k.churnRate}
            before={p?.churnRate ?? null}
            better="down"
          />
          <Tile
            label="Churn du dernier mois complet"
            value={pct(
              lastFullMonth?.rate !== null && lastFullMonth?.rate !== undefined
                ? lastFullMonth.rate / 100
                : null,
            )}
            sub={
              lastFullMonth
                ? new Date(
                    `${lastFullMonth.month}T00:00:00Z`,
                  ).toLocaleDateString("fr-FR", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  })
                : undefined
            }
          />
          <Tile
            label="Remboursements"
            value={pct(k.refundRate)}
            sub={`${count(k.refunded)} remboursées`}
            now={k.refundRate}
            before={p?.refundRate ?? null}
            better="down"
          />
        </div>
        <div className="mt-5">
          <LineChart
            ariaLabel={
              spending ? "Revenu et dépenses par jour" : "Revenu par jour"
            }
            labels={chart.points.map((x) => x.label)}
            series={[
              {
                name: chart.weekly
                  ? "Revenu / jour (moy. de la semaine)"
                  : "Revenu / jour",
                color: "var(--color-series-revenue)",
                values: chart.points.map((x) => x.revenue),
              },
              ...(spending
                ? [
                    {
                      name: chart.weekly
                        ? "Dépenses / jour (moy. de la semaine)"
                        : "Dépenses / jour",
                      color: "var(--color-series-spend)",
                      values: chart.points.map((x) => x.spend),
                    },
                  ]
                : []),
            ]}
            format={(v) => eur0.format(v)}
          />
        </div>
      </Section>

      {/* ----------------------------------------------------- upcoming */}
      {upcoming && payload.rc?.ltvInputs ? (
        <Section
          title="Échéances des 10 prochains jours"
          source="RevenueCat · abonnements en cours"
        >
          <UpcomingPanel upcoming={upcoming} inputs={payload.rc.ltvInputs} />
        </Section>
      ) : null}

      {/* -------------------------------------------------- acquisition */}
      <Section
        title="Acquisition"
        source={
          spending
            ? "AppsFlyer · Amplitude · dépenses saisies"
            : "AppsFlyer · Amplitude"
        }
        missing={afMissing && ampMissing ? afMissing : null}
      >
        <div className={GRID}>
          {afMissing ? (
            <Tile label="Installs" value="-" sub={afMissing} />
          ) : (
            <Tile
              label="Installs"
              value={count(k.installs)}
              sub={`${count(k.installsOrganic)} organiques · ${count(k.installsPaid)} campagnes`}
              now={k.installs}
              before={p?.installs ?? null}
              hint="AppsFlyer, iOS + Android"
            />
          )}
          <Tile
            label="Nouveaux utilisateurs"
            value={count(k.newUsers)}
            now={k.newUsers}
            before={p?.newUsers ?? null}
            hint="Amplitude : premier événement dans l'app"
          />
          {spending ? (
            <>
              <Tile
                label="Dépenses"
                value={money(k.spend)}
                now={k.spend}
                before={p?.spend ?? null}
                better={null}
              />
              <Tile
                label="ROAS (revenu ÷ dépenses)"
                value={pct(k.roas, 0)}
                now={k.roas}
                before={p?.roas ?? null}
                hint="Revenu de la période ÷ dépenses de la période, tous utilisateurs confondus"
              />
              <Tile
                label="Coût par install"
                value={money(k.cpi)}
                now={k.cpi}
                before={p?.cpi ?? null}
                better="down"
                hint="Dépenses ÷ installs (organiques compris)"
              />
            </>
          ) : null}
        </div>
        {spending && cohorts.rows.length > 0 ? (
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(["d0", "d7", "d30", "lifetime"] as const).map((key) => (
              <Tile
                key={key}
                label={`ROAS cohortes ${key === "lifetime" ? "à date" : `J${key.slice(1)}`}`}
                value={pct(cohorts.totals.roas[key], 0)}
                sub={
                  cohorts.totals.spendAt[key] > 0
                    ? `${money(cohorts.totals.revenue[key])} / ${money(cohorts.totals.spendAt[key])}`
                    : "aucune cohorte arrivée à ce jour"
                }
                hint="Revenu des nouveaux clients de chaque semaine au jour N ÷ dépenses de leur semaine (semaines arrivées à ce jour seulement)"
              />
            ))}
          </div>
        ) : null}
      </Section>

      {/* -------------------------------------------------------- usage */}
      <Section title="Utilisation" source="Amplitude" missing={ampMissing}>
        <div className={GRID}>
          <Tile
            label="DAU moyen"
            value={count(k.dauAvg === null ? null : Math.round(k.dauAvg))}
            now={k.dauAvg}
            before={p?.dauAvg ?? null}
          />
          <Tile
            label="WAU (7 j glissants)"
            value={count(k.wau)}
            now={k.wau}
            before={p?.wau ?? null}
            sub={`au ${shortDay(range.to)}`}
          />
          <Tile
            label="MAU (30 j glissants)"
            value={count(k.mau)}
            now={k.mau}
            before={p?.mau ?? null}
            sub={`au ${shortDay(range.to)}`}
          />
          <Tile
            label="Stickiness DAU / MAU"
            value={pct(k.stickiness)}
            now={k.stickiness}
            before={p?.stickiness ?? null}
          />
          <Tile
            label="ARPU / mois"
            value={money(k.arpuMonthly)}
            hint="Revenu ramené à 30 jours ÷ MAU moyen de la période (par utilisateur actif, payeur ou non)"
            now={k.arpuMonthly}
            before={p?.arpuMonthly ?? null}
          />
        </div>
        <div className="mt-5">
          <LineChart
            ariaLabel="Utilisateurs actifs par jour"
            labels={chart.points.map((x) => x.label)}
            series={[
              {
                name: chart.weekly
                  ? "Utilisateurs actifs (moy. de la semaine)"
                  : "Utilisateurs actifs",
                color: "var(--color-accent)",
                values: chart.points.map((x) => x.dau),
              },
            ]}
            format={(v) => int.format(v)}
            height={180}
          />
        </div>
      </Section>

      {/* --------------------------------------------------- conversion */}
      <Section
        title={`Conversion · app ${payload.conversionVersions ?? MIN_APP_VERSION}${payload.conversionVersions?.includes("→") ? "" : " et suivantes"}`}
        source="Amplitude · RevenueCat · nouveaux utilisateurs, par jour d'arrivée"
        missing={
          ampMissing ??
          (!conversionMeasured
            ? `Chiffres de l'app ${MIN_APP_VERSION} et suivantes pas encore relevés : ils arrivent au prochain relevé (ou clique sur Actualiser).`
            : k.has.conversion
              ? null
              : `Aucun nouvel utilisateur de l'app ${MIN_APP_VERSION} ou suivante sur cette période : les chiffres de conversion ne comptent que ces versions.`)
        }
      >
        <div className={GRID}>
          <Tile
            label="Onboarding terminé"
            value={pct(k.onboardingRate)}
            sub={`${count(k.onboardingDone)} / ${count(k.onboardingStart)} arrivés sur Home`}
            hint="First App Open → Onboarding Completed (arrivée sur Home) dans la journée"
            now={k.onboardingRate}
            before={p?.onboardingRate ?? null}
          />
          <Tile
            label="Achat ≤ 7 j"
            value={pct(k.purchase7Rate)}
            sub={`${count(k.purchase7Done)} / ${count(k.purchase7Start)}${k.purchase7Partial ? " · en cours" : ""}`}
            hint="First App Open → Subscription Purchased dans les 7 jours, selon Amplitude (les 7 derniers jours ne sont pas encore définitifs)"
            now={k.purchase7Rate}
            before={p?.purchase7Rate ?? null}
          />
          <Tile
            label="Conversion payante ≤ 7 j"
            value={pct(k.paying7Rate)}
            sub={`${count(k.paying7)} / ${count(k.paying7Base)} · RevenueCat${k.paying7Partial ? " · en cours" : ""}`}
            hint="Nouveaux clients qui ont payé dans les 7 jours, selon RevenueCat (remboursements du premier achat déduits ; les 7 derniers jours ne sont pas encore définitifs)"
            now={k.paying7Rate}
            before={p?.paying7Rate ?? null}
          />
          <Tile
            label="Acheteurs"
            value={count(k.buyers)}
            sub={`${pct(k.buyersRate)} des ${count(k.newUsersV2)} nouveaux utilisateurs`}
            hint="Utilisateurs ayant acheté un abonnement pendant la période, rapportés aux nouveaux utilisateurs de la période"
            now={k.buyers}
            before={p?.buyers ?? null}
          />
        </div>
      </Section>

      {/* ----------------------------------------------- unit economics */}
      <Section
        title="Valeur par client payant"
        source="RevenueCat · Amplitude"
        missing={rcMissing}
      >
        <div className="mb-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile
            label="ARPPU / mois"
            value={money(k.arppuMonthly)}
            hint="Revenu ramené à 30 jours ÷ abonnés actifs moyens"
            now={k.arppuMonthly}
            before={p?.arppuMonthly ?? null}
          />
        </div>
        {ltv && ltv.plans.length > 0 && ltv.gross[6] > 0 ? (
          <LtvPanel ltv={ltv} engagement={engagement} />
        ) : (
          <p className="text-[13px] text-[var(--color-ink-soft)]">
            {ltv
              ? "LTV par payeur indisponible : RevenueCat n'a pas renvoyé de ventes exploitables au dernier relevé."
              : "La LTV par payeur arrive au prochain relevé RevenueCat."}
          </p>
        )}
      </Section>

      {/* ------------------------------------------------------ cohorts */}
      {/* Cohorts serve the cohort ROAS: no spend in the period, no table (and
          the owners want the LTV as one number, not per cohort). */}
      {spending ? (
        <Section
          title="Cohortes hebdomadaires"
          source="RevenueCat · nouveaux clients du dimanche au samedi"
          missing={
            rcMissing ??
            (cohorts.rows.length === 0
              ? "Aucune cohorte sur cette période."
              : null)
          }
        >
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11.5px] font-medium text-[var(--color-ink-faint)]">
                  <th className="py-2 pr-3 font-medium">Semaine</th>
                  <th className="py-2 pr-3 text-right font-medium">Clients</th>
                  {spending ? (
                    <th className="py-2 pr-3 text-right font-medium">
                      Dépenses
                    </th>
                  ) : null}
                  {(["J0", "J7", "J30", "À date"] as const).map((h) => (
                    <th key={h} className="py-2 pr-3 text-right font-medium">
                      {spending ? `ROAS ${h}` : `Revenu/client ${h}`}
                    </th>
                  ))}
                  <th className="py-2 text-right font-medium">Revenu à date</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.rows.map((c) => (
                  <tr
                    key={c.cohortStart}
                    className="border-b border-[var(--color-line)] last:border-0"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {shortDay(c.cohortStart)}
                    </td>
                    <td className="py-2 pr-3 text-right">{count(c.size)}</td>
                    {spending ? (
                      <td className="py-2 pr-3 text-right">{money(c.spend)}</td>
                    ) : null}
                    {(["d0", "d7", "d30", "lifetime"] as const).map((key) => {
                      const complete = key === "lifetime" || c.complete[key];
                      const value = spending
                        ? pct(c.roas[key], 0)
                        : money(c.perCustomer[key]);
                      return (
                        <td
                          key={key}
                          className={cn(
                            "py-2 pr-3 text-right",
                            !complete && "text-[var(--color-ink-faint)] italic",
                          )}
                          title={
                            complete
                              ? undefined
                              : "En cours : tous les clients de la semaine n'ont pas encore atteint ce jour"
                          }
                        >
                          {(spending ? c.roas[key] : c.perCustomer[key]) ===
                          null
                            ? "-"
                            : value}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right">
                      {money(c.revenue.lifetime)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--color-line-strong)] font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3 text-right">
                    {count(cohorts.totals.size)}
                  </td>
                  {spending ? (
                    <td className="py-2 pr-3 text-right">
                      {money(cohorts.totals.spend)}
                    </td>
                  ) : null}
                  {(["d0", "d7", "d30", "lifetime"] as const).map((key) => (
                    <td key={key} className="py-2 pr-3 text-right">
                      {spending
                        ? pct(cohorts.totals.roas[key], 0)
                        : money(cohorts.totals.perCustomer[key])}
                    </td>
                  ))}
                  <td className="py-2 text-right">
                    {money(cohorts.totals.revenue.lifetime)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
            En italique : semaine pas encore arrivée à ce jour. Le total ne
            compte que les semaines arrivées à chaque jour.
            {spending
              ? " ROAS = revenu de la cohorte au jour N ÷ dépenses de sa semaine (toutes sources confondues : RevenueCat ne sait pas d'où viennent les clients)."
              : ""}
          </p>
        </Section>
      ) : null}

      <SpendPanel
        entries={payload.spend}
        today={payload.today}
        appsflyerHasCost={payload.appsflyerHasCost}
      />

      {/* ------------------------------------------------------ sources */}
      <Card className="p-5">
        <h2 className="mb-3 text-[16px] font-semibold tracking-[-0.01em]">
          Sources
        </h2>
        <ul className="space-y-2 text-[13px]">
          {payload.sources.map((s) => (
            <li
              key={s.source}
              className="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor: !s.configured
                    ? "var(--color-ink-faint)"
                    : s.error
                      ? "var(--color-danger)"
                      : "var(--color-accent)",
                }}
              />
              <span className="w-[92px] font-medium">{s.label}</span>
              <span className="text-[var(--color-ink-soft)]">
                {!s.configured
                  ? "Non branché : clé manquante dans Vercel"
                  : `Dernier relevé réussi : ${when(s.lastOk)}`}
              </span>
              {s.error ? (
                <span className="basis-full pl-[18px] text-[12px] text-[var(--color-danger)]">
                  Dernier essai ({when(s.lastAttempt)}) : {s.error}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

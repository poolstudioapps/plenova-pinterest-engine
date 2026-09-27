"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowsClockwise,
  Broadcast,
  CalendarDots,
  Coins,
  CurrencyEur,
  Database,
  Funnel,
  Pulse,
  Table,
} from "@phosphor-icons/react";
import { Button, Card, Notice } from "@/components/ui";
import {
  buckets,
  cohortRows,
  kpis,
  over,
  presetRange,
  previousRange,
  ratio,
  Series,
  spendByDay,
  trend,
  type Kpis,
  type Os,
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
import { saveView, type PerfView } from "@/lib/performance/view";
import { cn } from "@/lib/utils";
import { AcquisitionPanel, type AfPeriod } from "./AcquisitionPanel";
import {
  count,
  eur0,
  eur2,
  int,
  longDay,
  money,
  pct,
  percent,
  perDay,
  shortDay,
  when,
} from "./format";
import { LtvPanel } from "./LtvPanel";
import {
  ChartPanel,
  Crossfade,
  DatePill,
  fixRange,
  GRID,
  Section,
  Segmented,
  Tile,
  TileGroup,
  writeQuery,
  type ChartDef,
} from "./parts";
import { SpendPanel } from "./SpendPanel";
import { UpcomingPanel } from "./UpcomingPanel";

/* -------------------------------------------------------------- page -- */

const PRESETS: { id: Preset; label: string }[] = [
  { id: "7", label: "7 j" },
  { id: "30", label: "30 j" },
  { id: "60", label: "60 j" },
  { id: "all", label: "Depuis le début" },
];

export type InitialRange = { preset: Preset } | { custom: Range };

/** The axis of a chart in percent: whole numbers, the tooltip keeps a decimal. */
const pctTick = (v: number) => `${int.format(v)} %`;
const asPercent = (v: number | null) => (v === null ? null : v * 100);

export function PerformanceClient({
  payload,
  live,
  initial,
  initialView,
  initialAf,
}: {
  payload: PerfPayload;
  live: RevenueOverview | null;
  initial: InitialRange;
  initialView: PerfView;
  initialAf: AfPeriod;
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
  const [view, setView] = useState<PerfView>(initialView);
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
  // The small trend lines of the tiles. Not for revenue or daily users: the
  // big charts right under those tiles draw them.
  const spark = useMemo(() => {
    const of = (key: string) => trend(payload, key, range);
    return {
      mrr: of("revenuecat:mrr"),
      actives: of("revenuecat:actives"),
      newCustomers: of("revenuecat:new_customers"),
      newUsers: of("amplitude:new_users"),
      wau: of("amplitude:wau"),
      mau: of("amplitude:mau"),
      buyers: of("amplitude:buyers_v2"),
    };
  }, [payload, range]);
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
  const churnMonths = (payload.rc?.churnMonths ?? []).filter(
    (m) => !m.incomplete && m.rate !== null,
  );
  const lastFullMonth = churnMonths.at(-1) ?? null;

  /* --------------------------------------------- charts under the tiles */

  const s = useMemo(() => new Series(payload.series), [payload]);
  const b = useMemo(() => buckets(range), [range]);

  // The tiles of each group that draw a chart, the first being the default.
  const groups = {
    rev: [
      "revenue",
      "mrr",
      "actives",
      "newCustomers",
      "churn",
      ...(churnMonths.length > 1 ? ["churnMonth"] : []),
      "refunds",
      ...(spending ? ["spend", "roas"] : []),
    ],
    use: ["dau", "wau", "mau", "stickiness", "arpu", "newUsers"],
    conv: ["onboarding", "purchase7", "paying7", "buyers"],
  } as const satisfies Record<string, readonly string[]>;
  const shown = (group: keyof typeof groups) => {
    const ids: readonly string[] = groups[group];
    const saved = view.charts[group];
    return saved && ids.includes(saved) ? saved : ids[0]!;
  };

  function pickChart(group: string, id: string) {
    const next = { ...view, charts: { ...view.charts, [group]: id } };
    setView(next);
    saveView(next);
  }
  function pickOs(os: Os) {
    const next = { ...view, os };
    setView(next);
    saveView(next);
  }

  const chartFor = (id: string): ChartDef => {
    const weekly = b.weekly;
    const perDayCaption = weekly
      ? "moyenne par jour, semaine par semaine"
      : "jour par jour";
    const levelCaption = weekly ? "moyenne de chaque semaine" : "jour par jour";
    const rateCaption = weekly ? "semaine par semaine" : "jour par jour";
    const labels = b.labels;
    const one = (
      title: string,
      caption: string,
      values: (number | null)[],
      format: (v: number) => string,
      extra: Partial<ChartDef> = {},
      color = "var(--color-accent)",
    ): ChartDef => ({
      title,
      caption,
      labels,
      series: [{ name: title, color, values }],
      format,
      ...extra,
    });
    const sumPerDay = (key: string) => over(b, (r, n) => s.sum(key, r) / n);
    const level = (key: string) => over(b, (r) => s.avg(key, r));
    const spendOf = (r: Range) =>
      [...spendByDay(payload, r).values()].reduce((a, v) => a + v, 0);
    const rate = (num: string, den: string) =>
      over(b, (r) => asPercent(ratio(s.sum(num, r), s.sum(den, r))));
    const rateExtra = { tick: pctTick, minStep: 0.5 };

    switch (id) {
      case "mrr":
        return one("MRR", levelCaption, level("revenuecat:mrr"), (v) => eur0.format(v), { zero: false });
      case "actives":
        return one("Abonnés actifs", levelCaption, level("revenuecat:actives"), (v) => int.format(v), { zero: false });
      case "newCustomers":
        return one("Nouveaux clients", perDayCaption, sumPerDay("revenuecat:new_customers"), perDay, { tick: (v) => int.format(v) });
      case "churn":
        return one(
          "Abonnements payants perdus",
          perDayCaption,
          sumPerDay("revenuecat:churn_churned"),
          perDay,
          { tick: (v) => int.format(v) },
        );
      case "churnMonth":
        return {
          title: "Churn mensuel, mois par mois",
          caption: "mois complets, tout l'historique",
          labels: churnMonths.map((m) =>
            new Date(`${m.month}T00:00:00Z`).toLocaleDateString("fr-FR", {
              month: "short",
              year: "2-digit",
              timeZone: "UTC",
            }),
          ),
          series: [
            {
              name: "Churn",
              color: "var(--color-accent)",
              values: churnMonths.map((m) => m.rate),
            },
          ],
          format: percent,
          ...rateExtra,
        };
      case "refunds":
        return one(
          "Remboursements",
          perDayCaption,
          sumPerDay("revenuecat:refund_refunded"),
          perDay,
          { tick: (v) => int.format(v) },
        );
      case "spend":
        return one(
          "Dépenses",
          perDayCaption,
          over(b, (r, n) => spendOf(r) / n),
          (v) => eur0.format(v),
          {},
          "var(--color-series-spend)",
        );
      case "roas":
        return one(
          "ROAS : revenu ÷ dépenses",
          rateCaption,
          over(b, (r) => asPercent(ratio(s.sum("revenuecat:revenue", r), spendOf(r)))),
          percent,
          rateExtra,
        );
      case "dau":
        return one("Utilisateurs actifs par jour", levelCaption, level("amplitude:dau"), (v) => int.format(v), { zero: false });
      case "wau":
        return one("WAU (7 j glissants)", levelCaption, level("amplitude:wau"), (v) => int.format(v), { zero: false });
      case "mau":
        return one("MAU (30 j glissants)", levelCaption, level("amplitude:mau"), (v) => int.format(v), { zero: false });
      case "stickiness":
        return one(
          "Stickiness DAU / MAU",
          rateCaption,
          over(b, (r) => asPercent(ratio(s.avg("amplitude:dau", r), s.avg("amplitude:mau", r)))),
          percent,
          rateExtra,
        );
      case "arpu":
        return one(
          "ARPU / mois",
          rateCaption,
          over(b, (r, n) =>
            ratio((s.sum("revenuecat:revenue", r) / n) * 30, s.avg("amplitude:mau", r)),
          ),
          (v) => eur2.format(v),
          { minStep: 0.05 },
        );
      case "newUsers":
        return one("Nouveaux utilisateurs", perDayCaption, sumPerDay("amplitude:new_users"), perDay, { tick: (v) => int.format(v) });
      case "onboarding":
        return one(
          "Onboarding terminé",
          rateCaption,
          rate("amplitude:onboarding_v2_done", "amplitude:onboarding_v2_start"),
          percent,
          rateExtra,
        );
      case "purchase7":
        return one(
          "Achat ≤ 7 j (Amplitude)",
          rateCaption,
          rate("amplitude:purchase_7d_v2_done", "amplitude:purchase_7d_v2_start"),
          percent,
          rateExtra,
        );
      case "paying7":
        return one(
          "Conversion payante ≤ 7 j (RevenueCat)",
          rateCaption,
          rate("revenuecat:conv_paying_7d_v2", "revenuecat:conv_new_customers_v2"),
          percent,
          rateExtra,
        );
      case "buyers":
        return one("Acheteurs", perDayCaption, sumPerDay("amplitude:buyers_v2"), perDay, { tick: (v) => int.format(v) });
      default:
        return {
          title: spending ? "Revenu et dépenses" : "Revenu",
          caption: perDayCaption,
          labels,
          series: [
            {
              name: "Revenu",
              color: "var(--color-series-revenue)",
              values: sumPerDay("revenuecat:revenue"),
            },
            ...(spending
              ? [
                  {
                    name: "Dépenses",
                    color: "var(--color-series-spend)",
                    values: over(b, (r, n) => spendOf(r) / n),
                  },
                ]
              : []),
          ],
          format: (v) => eur0.format(v),
        };
    }
  };

  const rev = shown("rev");
  const use = shown("use");
  const conv = shown("conv");
  // Only the three charts on screen are computed (a few hundred sums).
  const revChart = chartFor(rev);
  const useChart = chartFor(use);
  const convChart = chartFor(conv);

  /* ------------------------------------------------------------ period */

  function pickPreset(id: Preset) {
    setPreset(id);
    writeQuery({ p: id, from: null, to: null });
  }

  function pickDates(next: Range) {
    const fixed = fixRange(next, payload.firstDay, payload.today);
    if (!fixed) return;
    setPreset(null);
    setCustom(fixed);
    writeQuery({ p: null, from: fixed.from, to: fixed.to });
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
      .map((x) => x.lastOk)
      .filter((d): d is string => d !== null)
      .sort()
      .pop() ?? null;
  const nothing = Object.keys(payload.series).length === 0;
  const status = (source: "revenuecat" | "amplitude" | "appsflyer") =>
    payload.sources.find((x) => x.source === source);
  const missing = (
    source: "revenuecat" | "amplitude" | "appsflyer",
    has: boolean,
  ) => {
    const st = status(source);
    if (!st?.configured)
      return `${st?.label ?? source} n'est pas encore branché (clé manquante dans Vercel).`;
    if (!st.lastOk)
      return `Pas encore de relevé ${st.label} : clique sur Actualiser.`;
    if (!has) return "Pas de données sur cette période.";
    return null;
  };
  const rcMissing = missing("revenuecat", k.has.revenuecat);
  const ampMissing = missing("amplitude", k.has.amplitude);
  // Installs already stored count, even before AppsFlyer's first good reading.
  const afStatus = status("appsflyer");
  const afStored = Object.keys(payload.series).some((key) =>
    key.startsWith("appsflyer:installs_"),
  );
  const afMissing = afStored
    ? null
    : !afStatus?.configured
      ? "AppsFlyer n'est pas encore branché (clé manquante dans Vercel)."
      : "Pas encore de relevé AppsFlyer : clique sur Actualiser.";
  // "Not read yet" is not zero: the 2.0.0+ series exist once a refresh made them.
  const conversionMeasured =
    payload.series["amplitude:new_users_v2"] !== undefined ||
    payload.series["revenuecat:conv_new_customers_v2"] !== undefined;
  const ARPPU = (
    <Tile
      label="ARPPU / mois"
      value={money(k.arppuMonthly)}
      hint="Revenu ramené à 30 jours ÷ abonnés actifs moyens"
      now={k.arppuMonthly}
      before={p?.arppuMonthly ?? null}
    />
  );

  return (
    <Crossfade.Provider value={preset !== null}>
    <div className="space-y-5">
      {/* ---------------------------------------------------- period bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented<Preset>
          label="Période"
          value={preset}
          options={PRESETS}
          onChange={pickPreset}
        />
        {/* A chosen period lights the pill up; a preset leaves it quiet. */}
        <DatePill
          range={range}
          min={payload.firstDay}
          max={payload.today}
          active={preset === null}
          onChange={pickDates}
        />
        <div className="flex items-center gap-3 sm:ml-auto">
          <span className="text-[12px] leading-tight text-[var(--color-ink-faint)]">
            Relevé {when(lastOk)}
            <span className="hidden lg:inline"> · auto à 9 h, 18 h, 22 h</span>
          </span>
          <Button size="sm" onClick={refresh} disabled={refreshing}>
            <ArrowsClockwise
              aria-hidden
              size={15}
              weight="bold"
              className={cn(refreshing && "animate-spin")}
            />
            {refreshing ? "Relevé en cours…" : "Actualiser"}
          </Button>
        </div>
      </div>

      <p className="-mt-1 text-[12.5px] text-[var(--color-ink-faint)]">
        <span className="font-medium text-[var(--color-ink-soft)]">
          Du {longDay(range.from)} au {longDay(range.to)}
        </span>{" "}
        ({k.days} j, jours UTC
        {range.to === payload.today ? ", aujourd'hui en cours" : ""})
        {previous
          ? ` · comparé au ${shortDay(previous.from)} → ${shortDay(previous.to)}`
          : ""}
        {" "}
        · clique sur un chiffre pour voir sa courbe
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
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[16px] border border-[var(--color-edge)] bg-[var(--color-surface)] px-4 py-3 text-[13px] text-[var(--color-ink-soft)] shadow-[var(--shadow-card)]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-ink)]">
            <Broadcast aria-hidden size={16} weight="duotone" className="text-[var(--color-accent)]" />
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
        icon={CurrencyEur}
        source={
          spending
            ? "RevenueCat · brut TTC, remboursements déduits · dépenses saisies"
            : "RevenueCat · brut TTC, remboursements déduits"
        }
        missing={rcMissing}
      >
        <TileGroup
          label="Chiffre affiché dans le graphique des revenus"
          selected={rev}
          onSelect={(id) => pickChart("rev", id)}
          chart="chart-revenue"
          className={GRID}
        >
          <Tile
            id="revenue"
            label="Revenu"
            value={money(k.revenue)}
            sub={`${count(k.transactions)} transactions`}
            now={k.revenue}
            before={p?.revenue ?? null}
          />
          <Tile
            id="mrr"
            label="MRR (fin de période)"
            value={money(k.mrr)}
            spark={spark.mrr}
            now={k.mrr}
            before={p?.mrr ?? null}
          />
          <Tile
            id="actives"
            label="Abonnés actifs"
            value={count(k.activeSubscriptions)}
            spark={spark.actives}
            now={k.activeSubscriptions}
            before={p?.activeSubscriptions ?? null}
          />
          <Tile
            id="newCustomers"
            label="Nouveaux clients"
            value={count(k.newCustomers)}
            spark={spark.newCustomers}
            now={k.newCustomers}
            before={p?.newCustomers ?? null}
            hint="Clients vus pour la première fois par RevenueCat"
          />
          <Tile
            id="churn"
            label="Churn mensuel moyen"
            value={pct(k.churnRate)}
            sub={`${count(k.churned)} perdus sur la période`}
            hint="Abonnements payants perdus ÷ abonnements actifs moyens, ramené à 30 jours"
            now={k.churnRate}
            before={p?.churnRate ?? null}
            better="down"
          />
          <Tile
            id={churnMonths.length > 1 ? "churnMonth" : undefined}
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
            id="refunds"
            label="Remboursements"
            value={pct(k.refundRate)}
            sub={`${count(k.refunded)} remboursées`}
            now={k.refundRate}
            before={p?.refundRate ?? null}
            better="down"
          />
          {spending ? (
            <>
              <Tile
                id="spend"
                label="Dépenses"
                value={money(k.spend)}
                now={k.spend}
                before={p?.spend ?? null}
                better={null}
              />
              <Tile
                id="roas"
                label="ROAS (revenu ÷ dépenses)"
                value={pct(k.roas, 0)}
                now={k.roas}
                before={p?.roas ?? null}
                hint="Revenu de la période ÷ dépenses de la période, tous utilisateurs confondus"
              />
            </>
          ) : null}
        </TileGroup>
        <ChartPanel id={rev} domId="chart-revenue" chart={revChart} />
      </Section>

      {/* ----------------------------------------------------- upcoming */}
      {upcoming && payload.rc?.ltvInputs ? (
        <Section
          title="Échéances des 10 prochains jours"
          icon={CalendarDots}
          source="RevenueCat · abonnements en cours"
        >
          <UpcomingPanel upcoming={upcoming} inputs={payload.rc.ltvInputs} />
        </Section>
      ) : null}

      {/* -------------------------------------------------- acquisition */}
      <AcquisitionPanel
        payload={payload}
        pageRange={range}
        initialPeriod={initialAf}
        os={view.os}
        onOs={pickOs}
        chart={view.charts.acq}
        onChart={(id) => pickChart("acq", id)}
        missing={afMissing}
      />

      {/* -------------------------------------------------------- usage */}
      <Section title="Utilisation" icon={Pulse} source="Amplitude" missing={ampMissing}>
        <TileGroup
          label="Chiffre affiché dans le graphique d'utilisation"
          selected={use}
          onSelect={(id) => pickChart("use", id)}
          chart="chart-usage"
          className={GRID}
        >
          <Tile
            id="dau"
            label="DAU moyen"
            value={count(k.dauAvg === null ? null : Math.round(k.dauAvg))}
            now={k.dauAvg}
            before={p?.dauAvg ?? null}
          />
          <Tile
            id="wau"
            label="WAU (7 j glissants)"
            value={count(k.wau)}
            spark={spark.wau}
            now={k.wau}
            before={p?.wau ?? null}
            sub={`au ${shortDay(range.to)}`}
          />
          <Tile
            id="mau"
            label="MAU (30 j glissants)"
            value={count(k.mau)}
            spark={spark.mau}
            now={k.mau}
            before={p?.mau ?? null}
            sub={`au ${shortDay(range.to)}`}
          />
          <Tile
            id="stickiness"
            label="Stickiness DAU / MAU"
            value={pct(k.stickiness)}
            now={k.stickiness}
            before={p?.stickiness ?? null}
          />
          <Tile
            id="arpu"
            label="ARPU / mois"
            value={money(k.arpuMonthly)}
            hint="Revenu ramené à 30 jours ÷ MAU moyen de la période (par utilisateur actif, payeur ou non)"
            now={k.arpuMonthly}
            before={p?.arpuMonthly ?? null}
          />
          <Tile
            id="newUsers"
            label="Nouveaux utilisateurs"
            value={count(k.newUsers)}
            spark={spark.newUsers}
            now={k.newUsers}
            before={p?.newUsers ?? null}
            hint="Amplitude : premier événement dans l'app"
          />
        </TileGroup>
        <ChartPanel id={use} domId="chart-usage" chart={useChart} />
      </Section>

      {/* --------------------------------------------------- conversion */}
      <Section
        title={`Conversion · app ${payload.conversionVersions ?? MIN_APP_VERSION}${payload.conversionVersions?.includes("→") ? "" : " et suivantes"}`}
        icon={Funnel}
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
        <TileGroup
          label="Chiffre affiché dans le graphique de conversion"
          selected={conv}
          onSelect={(id) => pickChart("conv", id)}
          chart="chart-conversion"
          className={GRID}
        >
          <Tile
            id="onboarding"
            label="Onboarding terminé"
            value={pct(k.onboardingRate)}
            sub={`${count(k.onboardingDone)} / ${count(k.onboardingStart)} arrivés sur Home`}
            hint="First App Open → Onboarding Completed (arrivée sur Home) dans la journée"
            now={k.onboardingRate}
            before={p?.onboardingRate ?? null}
          />
          <Tile
            id="purchase7"
            label="Achat ≤ 7 j"
            value={pct(k.purchase7Rate)}
            sub={`${count(k.purchase7Done)} / ${count(k.purchase7Start)}${k.purchase7Partial ? " · en cours" : ""}`}
            hint="First App Open → Subscription Purchased dans les 7 jours, selon Amplitude (les 7 derniers jours ne sont pas encore définitifs)"
            now={k.purchase7Rate}
            before={p?.purchase7Rate ?? null}
          />
          <Tile
            id="paying7"
            label="Conversion payante ≤ 7 j"
            value={pct(k.paying7Rate)}
            sub={`${count(k.paying7)} / ${count(k.paying7Base)} · RevenueCat${k.paying7Partial ? " · en cours" : ""}`}
            hint="Nouveaux clients qui ont payé dans les 7 jours, selon RevenueCat (remboursements du premier achat déduits ; les 7 derniers jours ne sont pas encore définitifs)"
            now={k.paying7Rate}
            before={p?.paying7Rate ?? null}
          />
          <Tile
            id="buyers"
            label="Acheteurs"
            value={count(k.buyers)}
            spark={spark.buyers}
            sub={`${pct(k.buyersRate)} des ${count(k.newUsersV2)} nouveaux utilisateurs`}
            hint="Utilisateurs ayant acheté un abonnement pendant la période, rapportés aux nouveaux utilisateurs de la période"
            now={k.buyers}
            before={p?.buyers ?? null}
          />
        </TileGroup>
        <ChartPanel id={conv} domId="chart-conversion" chart={convChart} />
      </Section>

      {/* ----------------------------------------------- unit economics */}
      <Section
        title="Valeur par client payant"
        icon={Coins}
        source="RevenueCat · Amplitude"
        missing={rcMissing}
      >
        {ltv && ltv.plans.length > 0 && ltv.gross[6] > 0 ? (
          <LtvPanel ltv={ltv} engagement={engagement} lead={ARPPU} />
        ) : (
          <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{ARPPU}</div>
          <p className="text-[13px] text-[var(--color-ink-soft)]">
            {ltv
              ? "LTV par payeur indisponible : RevenueCat n'a pas renvoyé de ventes exploitables au dernier relevé."
              : "La LTV par payeur arrive au prochain relevé RevenueCat."}
          </p>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------ cohorts */}
      {/* Cohorts serve the cohort ROAS: no spend in the period, no table (and
          the owners want the LTV as one number, not per cohort). */}
      {spending ? (
        <Section
          title="Cohortes hebdomadaires"
          icon={Table}
          source="RevenueCat · nouveaux clients du dimanche au samedi"
          missing={
            rcMissing ??
            (cohorts.rows.length === 0
              ? "Aucune cohorte sur cette période."
              : null)
          }
        >
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left text-[11.5px] font-medium text-[var(--color-ink-faint)]">
                  <th className="py-2 pr-3 font-medium">Semaine</th>
                  <th className="py-2 pr-3 text-right font-medium">Clients</th>
                  <th className="py-2 pr-3 text-right font-medium">Dépenses</th>
                  {(["J0", "J7", "J30", "À date"] as const).map((h) => (
                    <th key={h} className="py-2 pr-3 text-right font-medium">
                      ROAS {h}
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
                    <td className="py-2 pr-3 text-right">{money(c.spend)}</td>
                    {(["d0", "d7", "d30", "lifetime"] as const).map((key) => {
                      const complete = key === "lifetime" || c.complete[key];
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
                          {c.roas[key] === null ? "-" : pct(c.roas[key], 0)}
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
                  <td className="py-2 pr-3 text-right">
                    {money(cohorts.totals.spend)}
                  </td>
                  {(["d0", "d7", "d30", "lifetime"] as const).map((key) => (
                    <td key={key} className="py-2 pr-3 text-right">
                      {pct(cohorts.totals.roas[key], 0)}
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
            compte que les semaines arrivées à chaque jour. ROAS = revenu de la
            cohorte au jour N ÷ dépenses de sa semaine (toutes sources
            confondues : RevenueCat ne sait pas d&apos;où viennent les clients).
          </p>
        </Section>
      ) : null}

      <SpendPanel
        entries={payload.spend}
        today={payload.today}
        appsflyerHasCost={payload.appsflyerHasCost}
        appsflyerCost={payload.series["appsflyer:cost"] ?? {}}
      />

      {/* ------------------------------------------------------ sources */}
      <Card className="p-5 md:p-6">
        <h2 className="mb-4 flex items-center gap-2.5 text-[16.5px] font-semibold tracking-[-0.015em]">
          <span className="grid size-8 place-items-center rounded-[10px] bg-[var(--color-surface-muted)] text-[var(--color-accent-ink)]">
            <Database aria-hidden size={17} weight="duotone" />
          </span>
          Sources
        </h2>
        <ul className="divide-y divide-[var(--color-line)] text-[13px]">
          {payload.sources.map((src) => (
            <li
              key={src.source}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
            >
              {/* Real state, so a dot - with a ring on it when something is wrong. */}
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  src.configured && src.error && "ring-3 ring-[var(--color-danger-soft)]",
                  src.configured && !src.error && src.warning && "ring-3 ring-[var(--color-warn-soft)]",
                )}
                style={{
                  backgroundColor: !src.configured
                    ? "var(--color-ink-faint)"
                    : src.error
                      ? "var(--color-danger)"
                      : src.warning
                        ? "var(--color-warn)"
                        : "var(--color-accent)",
                }}
              />
              <span className="w-[92px] font-medium">{src.label}</span>
              <span className="text-[var(--color-ink-soft)]">
                {!src.configured
                  ? "Non branché : clé manquante dans Vercel"
                  : `Dernier relevé réussi : ${when(src.lastOk)}`}
              </span>
              {src.error ? (
                <span className="basis-full pl-[20px] text-[12px] text-[var(--color-danger)]">
                  Dernier essai ({when(src.lastAttempt)}) : {src.error}
                </span>
              ) : src.warning ? (
                <span className="basis-full pl-[20px] text-[12px] text-[var(--color-warn-ink)]">
                  {src.warning}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
    </Crossfade.Provider>
  );
}

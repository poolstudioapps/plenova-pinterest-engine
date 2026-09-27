"use client";

import { useContext, useMemo, useState } from "react";
import { AndroidLogo, AppleLogo, UsersThree } from "@phosphor-icons/react";
import {
  addDays,
  afKpis,
  afPurchases,
  afSum,
  buckets,
  dayCount,
  eventsRange,
  over,
  previousRange,
  ratio,
  Series,
  spendByDay,
  type Os,
  type PerfPayload,
  type Range,
} from "@/lib/performance/compute";
import {
  count,
  eur0,
  eur2,
  int,
  money,
  pct,
  percent,
  perDay,
  shortDay,
} from "./format";
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

/** The AppsFlyer section's own period: the page's, a preset, or dates. */
export type AfPeriod =
  | { kind: "page" }
  | { kind: "preset"; days: 7 | 30 | 90 }
  | { kind: "custom"; range: Range };

type PeriodChoice = "page" | "7" | "30" | "90";

const OS_LABEL: Record<Os, string> = { all: "les deux stores", ios: "iOS", android: "Android" };

/**
 * Acquisition, from AppsFlyer: installs, activation, purchases and - once
 * some spend covers the period - what each of them cost. It has filters of
 * its own: the store (iOS, Android or both) and a period that follows the
 * page's until another one is picked here.
 */
export function AcquisitionPanel({
  payload,
  pageRange,
  initialPeriod,
  os,
  onOs,
  chart,
  onChart,
  missing,
}: {
  payload: PerfPayload;
  pageRange: Range;
  initialPeriod: AfPeriod;
  os: Os;
  onOs: (os: Os) => void;
  chart: string | undefined;
  onChart: (id: string) => void;
  /** Why there is nothing to show (not connected...), or null. */
  missing: string | null;
}) {
  const [period, setPeriod] = useState<AfPeriod>(initialPeriod);
  // Following the page, its figures crossfade when the page's do.
  const pageCrossfade = useContext(Crossfade);
  const { today, firstDay } = payload;

  const { from, to } =
    period.kind === "page"
      ? pageRange
      : period.kind === "custom"
        ? period.range
        : (() => {
            // Whole days, like the page's presets: they end yesterday.
            const end = addDays(today, -1);
            const start = addDays(end, -(period.days - 1));
            return { from: start < firstDay ? firstDay : start, to: end };
          })();
  const range = useMemo(() => ({ from, to }), [from, to]);
  const previous = useMemo(() => previousRange(range, firstDay), [range, firstDay]);
  const k = useMemo(() => afKpis(payload, range, os), [payload, range, os]);
  const p = useMemo(
    () => (previous ? afKpis(payload, previous, os) : null),
    [payload, previous, os],
  );
  const spending = k.spend > 0;
  const hasEvents = k.eventsFrom !== null;
  // A count of events only compares with a previous period read as fully:
  // one half without events would pass for a jump. (Rates are over the same days.)
  const comparable = p !== null && !p.eventsPartial && !k.eventsPartial;
  const notRead = hasEvents && k.eventsFrom
    ? `relevés depuis le ${shortDay(k.eventsFrom)}`
    : "au prochain relevé";

  const s = useMemo(() => new Series(payload.series), [payload]);
  const b = useMemo(() => buckets(range), [range]);
  const spark = useMemo(
    () => over(b, (r, n) => afSum(s, "installs", os, r) / n),
    [b, s, os],
  );

  function pickPeriod(choice: PeriodChoice) {
    if (choice === "page") {
      setPeriod({ kind: "page" });
      writeQuery({ af: null, af_from: null, af_to: null });
    } else {
      setPeriod({ kind: "preset", days: Number(choice) as 7 | 30 | 90 });
      writeQuery({ af: choice, af_from: null, af_to: null });
    }
  }
  function pickDates(next: Range) {
    const fixed = fixRange(next, firstDay, today);
    if (!fixed) return;
    setPeriod({ kind: "custom", range: fixed });
    writeQuery({ af: null, af_from: fixed.from, af_to: fixed.to });
  }

  // The tiles that have a chart; a remembered one that is gone falls back to installs.
  const ids = [
    "installs",
    ...(hasEvents ? ["activation", "purchases", "conversion"] : []),
    ...(spending ? ["spend", "cpi", "cpa", "cpact"] : []),
  ];
  const current = chart && ids.includes(chart) ? chart : "installs";

  const def = useMemo((): ChartDef => {
    const weekly = b.weekly;
    const perDayCaption = weekly ? "moyenne par jour, semaine par semaine" : "jour par jour";
    const rateCaption = weekly ? "semaine par semaine" : "jour par jour";
    // Event figures only where events were read; the days before are a gap, not a zero.
    const onEvents = (f: (r: Range, n: number) => number | null) =>
      over(b, (r) => {
        const ev = eventsRange(r, k.eventsFrom);
        return ev ? f(ev, dayCount(ev)) : null;
      });
    const spendOf = (r: Range) =>
      [...spendByDay(payload, r, os).values()].reduce((a, v) => a + v, 0);
    const base = { labels: b.labels };
    switch (current) {
      case "activation":
        return {
          ...base,
          title: "Activation : premières plantes ÷ installs",
          caption: rateCaption,
          series: [
            {
              name: "Activation",
              color: "var(--color-accent)",
              values: onEvents((r) => {
                const v = ratio(afSum(s, "first_plant", os, r), afSum(s, "installs", os, r));
                return v === null ? null : v * 100;
              }),
            },
          ],
          format: percent,
          tick: (v) => `${int.format(v)} %`,
        };
      case "purchases":
        return {
          ...base,
          title: "Achats des installés du jour",
          caption: perDayCaption,
          series: [
            {
              name: "Achats",
              color: "var(--color-accent)",
              values: onEvents((r, n) => afPurchases(s, os, r) / n),
            },
          ],
          format: perDay,
        };
      case "conversion":
        return {
          ...base,
          title: "Install → achat : achats ÷ installs",
          caption: rateCaption,
          series: [
            {
              name: "Install → achat",
              color: "var(--color-accent)",
              values: onEvents((r) => {
                const v = ratio(afPurchases(s, os, r), afSum(s, "installs", os, r));
                return v === null ? null : v * 100;
              }),
            },
          ],
          format: percent,
          tick: (v) => `${int.format(v)} %`,
          minStep: 0.5,
        };
      case "spend":
        return {
          ...base,
          title: "Dépenses",
          caption: perDayCaption,
          series: [
            {
              name: "Dépenses",
              color: "var(--color-series-spend)",
              values: over(b, (r, n) => spendOf(r) / n),
            },
          ],
          format: (v) => eur0.format(v),
        };
      case "cpi":
      case "cpa":
      case "cpact": {
        const per =
          current === "cpi"
            ? (r: Range) => afSum(s, "installs", os, r)
            : current === "cpa"
              ? (r: Range) => afPurchases(s, os, r)
              : (r: Range) => afSum(s, "first_plant", os, r);
        const values =
          current === "cpi"
            ? over(b, (r) => ratio(spendOf(r), per(r)))
            : onEvents((r) => ratio(spendOf(r), per(r)));
        return {
          ...base,
          title:
            current === "cpi"
              ? "Coût par install"
              : current === "cpa"
                ? "Coût par achat"
                : "Coût par activation (première plante)",
          caption: rateCaption,
          series: [{ name: "Coût", color: "var(--color-series-spend)", values }],
          format: (v) => eur2.format(v),
          tick: (v) => (v >= 10 ? eur0.format(v) : eur2.format(v)),
          minStep: 0.01,
        };
      }
      default:
        return {
          ...base,
          title: "Installs",
          caption: perDayCaption,
          series: [
            {
              name: "Organiques",
              color: "var(--color-accent)",
              values: over(b, (r, n) => afSum(s, "installs_organic", os, r) / n),
            },
            {
              name: "Campagnes",
              color: "var(--color-series-revenue)",
              values: over(b, (r, n) => afSum(s, "installs_paid", os, r) / n),
            },
          ],
          format: perDay,
          tick: (v) => int.format(v),
        };
    }
  }, [current, b, s, os, payload, k.eventsFrom]);

  const periodChoice: PeriodChoice | null =
    period.kind === "page" ? "page" : period.kind === "preset" ? (String(period.days) as PeriodChoice) : null;

  const toolbar = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Os>
          size="sm"
          label="Store"
          value={os}
          onChange={onOs}
          options={[
            { id: "all", label: "Les deux" },
            {
              id: "ios",
              label: (
                <>
                  <AppleLogo aria-hidden size={14} weight="fill" /> iOS
                </>
              ),
            },
            {
              id: "android",
              label: (
                <>
                  <AndroidLogo aria-hidden size={14} weight="fill" /> Android
                </>
              ),
            },
          ]}
        />
        <Segmented<PeriodChoice>
          size="sm"
          label="Période de la section"
          value={periodChoice}
          onChange={pickPeriod}
          options={[
            { id: "page", label: "Période de la page" },
            { id: "7", label: "7 j" },
            { id: "30", label: "30 j" },
            { id: "90", label: "90 j" },
          ]}
        />
        <DatePill
          label="Dates de la section"
          range={range}
          min={firstDay}
          max={today}
          active={period.kind === "custom"}
          onChange={pickDates}
        />
      </div>
      {period.kind !== "page" ? (
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          Période propre à cette section : {dayCount(range)} j, du{" "}
          {shortDay(range.from)} au {shortDay(range.to)}
          {previous ? ` · période précédente : ${shortDay(previous.from)} → ${shortDay(previous.to)}` : ""}
          {" · "}
          <button
            type="button"
            onClick={() => pickPeriod("page")}
            className="font-medium text-[var(--color-accent)] hover:underline"
          >
            reprendre celle de la page
          </button>
        </p>
      ) : null}
    </div>
  );

  const notes: string[] = [];
  if (!hasEvents)
    notes.push(
      "Achats et premières plantes : ils arrivent au prochain relevé AppsFlyer.",
    );
  else if (k.eventsPartial && k.eventsFrom)
    notes.push(
      `Achats et premières plantes relevés à partir du ${shortDay(k.eventsFrom)} : les taux ne comptent que ces jours-là.`,
    );
  if (!spending)
    notes.push(
      os !== "all" && k.untagged > 0
        ? `Aucune dépense ne vise ${OS_LABEL[os]} sur cette période : ${money(k.untagged)} saisis pour les deux stores ne sont pas répartis entre eux.`
        : "CPI, coût par achat et coût par activation s'affichent dès qu'une dépense couvre cette période (Dépenses publicitaires, plus bas).",
    );
  else if (os !== "all" && k.untagged > 0)
    notes.push(
      `Hors ${money(k.untagged)} saisis pour les deux stores (non répartis entre iOS et Android).`,
    );

  const tiles = (
    <>
      <TileGroup
        label="Chiffre affiché dans le graphique"
        selected={current}
        onSelect={onChart}
        chart="chart-acquisition"
        className={GRID}
      >
        <Tile
          id="installs"
          label="Installs"
          value={count(k.installs)}
          spark={spark}
          sub={`${count(k.organic)} organiques · ${count(k.paid)} campagnes`}
          now={k.installs}
          before={p?.installs ?? null}
          hint={`AppsFlyer, ${OS_LABEL[os]}`}
        />
        <Tile
          id={hasEvents ? "activation" : undefined}
          label="Activation (1re plante)"
          value={pct(k.activationRate)}
          sub={k.activations === null ? notRead : `${count(k.activations)} premières plantes`}
          now={k.activationRate}
          before={p?.activationRate ?? null}
          hint="Part des installs de la période qui ont ajouté une première plante, selon AppsFlyer"
        />
        <Tile
          id={hasEvents ? "purchases" : undefined}
          label="Achats (AppsFlyer)"
          value={count(k.purchases)}
          sub={
            k.purchases === null
              ? notRead
              : `${count(k.purchasesAnnual)} annuels · ${count(k.purchasesMonthly)} mensuels${k.purchasesOto ? ` · ${count(k.purchasesOto)} offre unique` : ""}`
          }
          now={k.purchases}
          before={comparable ? (p?.purchases ?? null) : null}
          hint="Installés de la période qui ont acheté, selon AppsFlyer (le chiffre grandit tant qu'ils achètent)"
        />
        <Tile
          id={hasEvents ? "conversion" : undefined}
          label="Install → achat"
          value={pct(k.purchaseRate)}
          sub={
            k.purchases === null
              ? notRead
              : `${count(k.purchases)} achats / ${count(k.eventInstalls)} installs`
          }
          now={k.purchaseRate}
          before={p?.purchaseRate ?? null}
          hint="Part des installs de la période qui ont acheté"
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
              hint={os === "all" ? "Coûts AppsFlyer + dépenses saisies" : `Coûts AppsFlyer et dépenses saisies pour ${OS_LABEL[os]}`}
            />
            <Tile
              id="cpi"
              label="CPI (coût par install)"
              value={money(k.cpi)}
              sub={k.cpiPaid !== null ? `campagnes seules : ${money(k.cpiPaid)}` : "organiques compris"}
              now={k.cpi}
              before={p?.cpi ?? null}
              better="down"
              hint="Dépenses ÷ installs, organiques compris"
            />
            <Tile
              id="cpa"
              label="CPA (coût par achat)"
              value={money(k.cpa)}
              sub={k.cpaPaid !== null ? `achats issus de campagnes : ${money(k.cpaPaid)}` : "tous achats confondus"}
              now={k.cpa}
              before={p?.cpa ?? null}
              better="down"
              hint="Dépenses ÷ achats vus par AppsFlyer"
            />
            <Tile
              id="cpact"
              label="Coût par activation"
              value={money(k.costPerActivation)}
              now={k.costPerActivation}
              before={p?.costPerActivation ?? null}
              better="down"
              hint="Dépenses ÷ premières plantes ajoutées"
            />
          </>
        ) : null}
      </TileGroup>
      {notes.length > 0 ? (
        <div className="mt-3 space-y-1 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      ) : null}
      <ChartPanel id={current} domId="chart-acquisition" chart={def} />
    </>
  );

  return (
    <Section
      title="Acquisition"
      icon={UsersThree}
      source={spending ? "AppsFlyer · dépenses saisies" : "AppsFlyer"}
      toolbar={missing ? undefined : toolbar}
      missing={missing ?? (k.has ? null : "Pas de données AppsFlyer sur cette période.")}
    >
      <Crossfade.Provider
        value={period.kind === "page" ? pageCrossfade : period.kind === "preset"}
      >
        {tiles}
      </Crossfade.Provider>
    </Section>
  );
}

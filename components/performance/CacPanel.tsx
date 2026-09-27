"use client";

import { useContext, useId, useState, type ReactNode } from "react";
import {
  CheckCircle,
  Clock,
  Hourglass,
  Info,
  Megaphone,
  Target,
  Warning,
  WarningOctagon,
  type Icon,
} from "@phosphor-icons/react";
import { Card, TILE, TILE_LABEL, TILE_VALUE } from "@/components/ui";
import { judged as isJudged, type CacReal, type CacTargets, type CacVerdict } from "@/lib/performance/cac";
import { cn } from "@/lib/utils";
import { eur2, int, pct, shortDay } from "./format";
import { Crossfade } from "./parts";

/*
 * The two figures at the top of Performances: what a paying customer may cost
 * (always, from the LTV), and what the campaigns of the period really paid
 * (only when something was spent). The sums are in lib/performance/cac.ts.
 */

/** Whole euros, one decimal under 10 €. */
const eur0 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const eur1 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const eur = (v: number) => (Math.abs(v) < 10 ? eur1 : eur0).format(v);
/** Differences of shown figures, without the float dust (21 - 16.3 = 4.699...). */
const gap = (a: number, b: number) => eur(Math.round((a - b) * 10) / 10);
/** "2 octobre": no abbreviation's full stop to run into the sentence's. */
const dayMonth = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
const plural = (n: number, one: string, many: string) =>
  `${int.format(n)} ${n > 1 ? many : one}`;

const payback = (m: number | null) =>
  m === null
    ? "remboursé en plus de 12 mois"
    : m === 0
      ? "remboursé dès le 1er paiement"
      : `remboursé en ~${m} mois`;

/* ------------------------------------------------------------ pieces -- */

function Head({
  icon: Glyph,
  title,
  sub,
  aside,
}: {
  icon: Icon;
  title: string;
  sub: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[var(--color-surface-muted)] text-[var(--color-accent-ink)]">
          <Glyph aria-hidden size={17} weight="duotone" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16.5px] leading-tight font-semibold tracking-[-0.015em]">
            {title}
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-ink-faint)]">
            {sub}
          </p>
        </div>
      </div>
      {aside}
    </div>
  );
}

/** "Comment c'est calculé": the reasoning, on demand, at the foot of a card. */
function HowItWorks({
  children,
  className = "mt-4",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="text-[12.5px] font-medium text-[var(--color-accent)] hover:underline"
      >
        {open ? "Masquer le calcul" : "Comment c'est calculé"}
      </button>
      {open ? (
        <div
          id={id}
          className="mt-2.5 space-y-2 rounded-[14px] border border-[var(--color-edge)] bg-[var(--color-canvas)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A flag on the targets: one line, with its glyph. */
function Note({ warn, children }: { warn?: boolean; children: ReactNode }) {
  const Glyph = warn ? Warning : Info;
  return (
    <p
      className={cn(
        "flex gap-1.5 text-[12px] leading-snug",
        warn ? "text-[var(--color-warn-ink)]" : "text-[var(--color-ink-soft)]",
      )}
    >
      <Glyph aria-hidden size={14} weight="bold" className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/* ----------------------------------------------------------- targets -- */

function TargetTile({
  label,
  caption,
  value,
  help,
}: {
  label: string;
  caption: string;
  value: number;
  help: string;
}) {
  return (
    <div className={TILE}>
      <span className={TILE_LABEL}>
        {label}
        <span className="block font-normal text-[var(--color-ink-faint)]">
          {caption}
        </span>
      </span>
      <span className={cn(TILE_VALUE, "mt-2.5 block")}>{eur(value)}</span>
      <span className="mt-2 block text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
        {help}
      </span>
    </div>
  );
}

function TargetsCard({
  targets: t,
  wide,
  waiting,
}: {
  targets: CacTargets;
  /** No spend in the period: the card has the row to itself. */
  wide: boolean;
  /** What stands in for the real CAC while nothing is spent. */
  waiting: string | null;
}) {
  const tiles = (
    <>
      <TargetTile
        label="Idéal"
        caption="avec de bonnes optis"
        value={t.ideal}
        help={`Au moins 1,50 € récupéré par euro dépensé en 12 mois · ${payback(t.paybackIdeal)}`}
      />
      <TargetTile
        label="Maximum"
        caption="à ne surtout pas dépasser"
        value={t.max}
        help="Au-delà, un client payant peut coûter plus qu'il ne rapporte en un an"
      />
    </>
  );
  const notes =
    t.notes.provisional || t.notes.driftDown || t.notes.fragile ? (
      <div className="space-y-1.5">
        {t.notes.provisional ? (
          <Note>Cibles provisoires : trop peu de renouvellements observés.</Note>
        ) : null}
        {t.notes.driftDown ? (
          <Note warn>
            Renouvellements en baisse sur les dernières cohortes : ces cibles
            pourraient baisser.
          </Note>
        ) : null}
        {t.notes.fragile ? (
          <Note>
            Plus d&apos;un quart de la LTV à 12 mois est encore projeté : cibles
            fragiles.
          </Note>
        ) : null}
      </div>
    ) : null;
  const basis = (
    <div className="space-y-1.5 text-[12px] leading-snug text-[var(--color-ink-faint)]">
      <p>
        D&apos;après la LTV nette à 12 mois :{" "}
        <span className="figures text-[var(--color-ink-soft)]">
          {eur0.format(t.ltv12)}
        </span>{" "}
        par client payant (fourchette{" "}
        <span className="figures">
          {int.format(Math.floor(t.ltv12Low))}–{eur0.format(t.ltv12High)}
        </span>
        ), recalculée à chaque relevé.
      </p>
      {t.cpiMax !== null && t.convRate !== null ? (
        <p>
          Repère CPI :{" "}
          <span className="figures text-[var(--color-ink-soft)]">
            {eur2.format(t.cpiMax)}
          </span>{" "}
          max, au taux d&apos;achat actuel ({pct(t.convRate)} des nouveaux
          utilisateurs paient sous 7 jours).
        </p>
      ) : null}
    </div>
  );
  const how = (
    <HowItWorks className="mt-3">
      <p>
        <b>Maximum :</b> bas de la fourchette de la LTV nette à 12 mois (après
        TVA, commission des stores et remboursements). Un client payant qui a
        coûté ça est {payback(t.paybackMax)} au rythme actuel.
      </p>
      <p>
        <b>Idéal :</b> LTV nette à 12 mois ÷ 1,5, et toujours au moins 15 %
        sous le maximum.
      </p>
      <p>
        <b>Pas comptés :</b> le renouvellement des abonnements annuels et les
        mois après le 12e. C&apos;est la marge de sécurité : les payants venus
        des pubs renouvellent souvent moins que les autres. Les coûts serveurs
        ne sont pas déduits non plus : ils en mangent une partie.
      </p>
      <p>
        Saisis les dépenses hors taxes : une saisie TTC gonfle le CAC de 20 %.
      </p>
      {t.notes.capped ? <p>Certains taux sont plafonnés par prudence.</p> : null}
    </HowItWorks>
  );

  return (
    <Card className="p-5 md:p-6">
      <Head icon={Target} title="CAC cible" sub="par client payant · iOS + Android" />
      {/* Columns from the card's own width: beside the real CAC it is narrow. */}
      <div className="@container">
      <div
        className={cn(
          "grid gap-3 @[20rem]:grid-cols-2",
          wide && "@[44rem]:grid-cols-[1fr_1fr_1.25fr]",
        )}
      >
        {tiles}
        {wide && waiting ? (
          // The real CAC's place, kept for when a campaign spends.
          <div className="flex flex-col justify-center gap-1.5 rounded-[18px] border border-dashed border-[var(--color-line-strong)] px-4 py-3.5 @[20rem]:col-span-2 @[44rem]:col-span-1">
            <span className={cn(TILE_LABEL, "flex items-center gap-1.5")}>
              <Megaphone aria-hidden size={14} weight="bold" className="text-[var(--color-ink-faint)]" />
              CAC réel des campagnes
            </span>
            <span className="text-[13px] leading-snug text-[var(--color-ink-soft)]">
              {waiting}
            </span>
          </div>
        ) : null}
      </div>
      </div>
      {notes ? <div className="mt-4">{notes}</div> : null}
      <div className="mt-4 border-t border-[var(--color-line)] pt-3.5">
        {basis}
        {how}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- real -- */

const VERDICTS: Record<
  Exclude<CacVerdict, "none">,
  { label: string; icon: Icon; chip: string; dot: string }
> = {
  good: {
    label: "Dans la cible",
    icon: CheckCircle,
    chip: "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]",
    dot: "var(--color-accent)",
  },
  thin: {
    label: "Rentable, marge faible",
    icon: Warning,
    chip: "bg-[var(--color-warn-soft)] text-[var(--color-warn-ink)]",
    dot: "var(--color-warn)",
  },
  over: {
    label: "Au-dessus du max",
    icon: WarningOctagon,
    chip: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
    dot: "var(--color-danger)",
  },
  confirm: {
    label: "À confirmer",
    icon: Clock,
    chip: "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]",
    dot: "var(--color-ink)",
  },
  early: {
    label: "Trop tôt",
    icon: Hourglass,
    chip: "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]",
    dot: "var(--color-ink)",
  },
  little: {
    label: "Trop peu de dépense",
    icon: Info,
    chip: "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]",
    dot: "var(--color-ink)",
  },
  unread: {
    label: "En attente de relevé",
    icon: Clock,
    chip: "bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)]",
    dot: "var(--color-ink)",
  },
};

function Chip({ verdict }: { verdict: CacVerdict }) {
  if (verdict === "none") return null;
  const v = VERDICTS[verdict];
  const Glyph = v.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
        v.chip,
      )}
    >
      <Glyph aria-hidden size={15} weight="bold" />
      {v.label}
    </span>
  );
}

const MOVE =
  "transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";
const ceil5 = (v: number) => Math.max(5, Math.ceil(v / 5) * 5);
/** Where a label sits on its mark: centred, or kept inside the track at its ends. */
const anchor = (x: number) => (x < 12 ? "0%" : x > 88 ? "-100%" : "-50%");

/**
 * One axis in euros: the targets as ticks, the best case as a ring, the
 * estimate as a dot in the verdict's colour, the stretch between them as the
 * range the true CAC lies in. Without an estimate, the ring fades out towards
 * the end: "at least".
 */
function Scale({
  targets: t,
  real,
  label,
}: {
  targets: CacTargets;
  real: CacReal;
  label: string;
}) {
  const est = real.estimate;
  const floor = real.bestCase ?? 0;
  const top = ceil5(
    Math.min(3 * t.max, Math.max(1.5 * t.max, 1.1 * (est ?? 0), 1.1 * floor)),
  );
  const x = (v: number) => Math.min(100, Math.max(0, (v / top) * 100));
  const over = Math.max(est ?? 0, floor);
  const dot = real.verdict === "none" ? "var(--color-ink)" : VERDICTS[real.verdict].dot;
  const lo = Math.min(x(floor), est === null ? 100 : x(est));
  const hi = Math.max(x(floor), est === null ? 100 : x(est));
  // A full-width layer slid along the track: transform only, so it animates cheaply.
  const at = (v: number) => ({ transform: `translateX(${x(v)}%)` });

  return (
    // Clipped sideways, the slid layers reach past the track; the padding
    // leaves room for a marker sitting on either end (labels stay inside).
    <div role="img" aria-label={label} className="relative -mx-2 mt-5 mb-1 overflow-x-clip px-2 pt-5 pb-5">
      <div className="relative h-2 rounded-full bg-[var(--color-surface-muted)]">
        {/* The range, or "at least" from the ring to the end. */}
        <div
          aria-hidden
          className={cn("absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 origin-left", MOVE)}
          style={{
            transform: `translateX(${lo}%) scaleX(${(hi - lo) / 100})`,
            background:
              est === null
                ? "linear-gradient(to right, var(--color-ink-faint), transparent)"
                : "var(--color-ink-faint)",
          }}
        />
        {/* Ideal: a quiet tick, its label above. */}
        <div aria-hidden className={cn("absolute inset-0", MOVE)} style={at(t.ideal)}>
          <span className="absolute top-1/2 left-0 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-ink-soft)]" />
          <span
            className="figures absolute bottom-[calc(100%+6px)] left-0 text-[11px] whitespace-nowrap text-[var(--color-ink-soft)]"
            style={{ transform: `translateX(${anchor(x(t.ideal))})` }}
          >
            idéal {eur(t.ideal)}
          </span>
        </div>
        {/* Maximum: the hard line, its label below. */}
        <div aria-hidden className={cn("absolute inset-0", MOVE)} style={at(t.max)}>
          <span className="absolute top-1/2 left-0 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-ink)]" />
          <span
            className="figures absolute top-[calc(100%+6px)] left-0 text-[11px] font-medium whitespace-nowrap text-[var(--color-ink)]"
            style={{ transform: `translateX(${anchor(x(t.max))})` }}
          >
            max {eur(t.max)}
          </span>
        </div>
        {/* Best case: a ring. */}
        {real.bestCase !== null ? (
          <div aria-hidden className={cn("absolute inset-0", MOVE)} style={at(floor)}>
            <span className="absolute top-1/2 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-ink-soft)] bg-[var(--color-tile)]" />
          </div>
        ) : null}
        {/* Estimate: a dot in the verdict's colour. */}
        {est !== null ? (
          <div aria-hidden className={cn("absolute inset-0", MOVE)} style={at(est)}>
            <span
              className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--color-tile)]"
              style={{ backgroundColor: dot }}
            />
          </div>
        ) : null}
        {over > top ? (
          <span
            aria-hidden
            className="figures absolute top-[calc(100%+6px)] right-0 text-[11px] font-medium text-[var(--color-ink)]"
          >
            › {eur(over)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RealCard({
  targets: t,
  real,
}: {
  targets: CacTargets;
  real: CacReal;
}) {
  const crossfade = useContext(Crossfade);
  const judged = isJudged(real.verdict);
  const certain =
    real.verdict === "over" && real.bestCase !== null && real.bestCase > t.max;
  const threshold = eur(t.available ? t.max : 20);
  // Some counted days come before AppsFlyer's events.
  const partial = real.eventsFrom !== null && real.daysWithEvents > 0 && real.daysWithEvents < real.days;
  const figure = judged
    ? real.estimate !== null
      ? `≈ ${eur(real.estimate)}`
      : `au moins ${eur(real.bestCase ?? 0)}`
    : null;
  const provisional = t.notes.provisional ? " (cibles provisoires)" : "";

  let distance: string | null = null;
  if (real.verdict === "good" && real.estimate !== null) {
    distance =
      real.estimate < t.ideal
        ? `${gap(t.ideal, real.estimate)} sous l'idéal`
        : "Pile sur l'idéal";
  } else if (real.verdict === "thin" && real.estimate !== null) {
    distance = `${gap(real.estimate, t.ideal)} au-dessus de l'idéal, ${
      real.estimate < t.max ? `${gap(t.max, real.estimate)} sous le max` : "pile sur le max"
    }`;
  } else if (real.verdict === "over") {
    // Measured from the figure on show: the estimate if there is one.
    distance =
      real.estimate !== null
        ? `+${gap(real.estimate, t.max)} au-dessus du max, par client payant`
        : `Au moins +${gap(real.bestCase ?? 0, t.max)} au-dessus du max`;
  }
  if (distance) distance += provisional;

  const advice = (() => {
    switch (real.verdict) {
      case "good":
        return "Sous l'idéal : chaque client payant est vite remboursé. Tu peux monter le budget par paliers.";
      case "thin":
        return "Rentable, mais la marge est mince : optimise créas et ciblage avant d'augmenter le budget.";
      case "over":
        return certain
          ? "Même en comptant tous les nouveaux payants comme venus des pubs, c'est trop cher : coupe ou change la campagne."
          : "Chaque client payant coûte plus qu'il ne rapporte en un an. Baisse le budget et corrige avant de relancer.";
      case "confirm":
        return real.noPayers
          ? `AppsFlyer attribue ${plural(real.attributed, "achat", "achats")} aux pubs${partial ? ` depuis le ${shortDay(real.eventsFrom!)}` : ""}, mais RevenueCat ne voit aucun nouveau payant ces jours-là : pas d'estimation possible.`
          : real.daysWithEvents === 0
            ? "Sans événements AppsFlyer sur ces jours, seul le minimum est connu : pas de verdict tant qu'il reste sous le max."
            : `Pas encore assez d'achats attribués aux pubs (${int.format(real.attributed)}/10) pour trancher.`;
      case "early":
        return real.matureElsewhere
          ? "Les 7 derniers jours attendent encore leurs achats. Passe sur 30 j pour voir les jours complets."
          : real.verdictOn
            ? `Les achats arrivent jusqu'à 7 jours après l'install : premier verdict le ${dayMonth(real.verdictOn)}, sur la période 30 j.`
            : `On juge après au moins ${threshold} dépensés sur des jours complets.`;
      case "little":
        return `Moins de ${threshold} dépensés sur des jours complets : trop peu pour juger.`;
      case "unread":
        return "RevenueCat n'a pas encore de relevé pour certains jours de dépense : le CAC s'affichera après le prochain relevé réussi.";
      case "none":
        return "Cibles indisponibles : pas de verdict.";
    }
  })();

  // Before a verdict the spend on show says it all.
  // With an estimate, the figures of its own days, so they divide into it.
  const counted =
    real.days === 0 || !judged
      ? null
      : real.adPayers !== null
        ? `${eur(real.estSpent)} dépensés · ≈ ${plural(Math.round(real.adPayers), "client payant venu", "clients payants venus")} des pubs, sur ${plural(real.estPayers, "nouveau payant", "nouveaux payants")}`
        : `${eur(real.spent)} dépensés · ${plural(real.payers, "nouveau payant", "nouveaux payants")} · ${plural(real.attributed, "achat attribué", "achats attribués")} aux pubs`;
  const events = !judged
    ? null
    : real.days > 0 && real.daysWithEvents === 0
      ? "Pas d'événements AppsFlyer sur ces jours : seul le minimum est calculable."
      : real.skipped > 0 && real.eventsFrom
        ? `${eur(real.skipped)} dépensés avant le ${shortDay(real.eventsFrom)} (pas d'événements AppsFlyer) : hors du ≈, mais vérifiés contre le max.`
        : partial && real.estimate === null
          ? `Pas d'événements AppsFlyer avant le ${shortDay(real.eventsFrom!)} : achats attribués comptés à partir de ce jour.`
          : null;

  const scaleLabel = `${[
    real.estimate !== null
      ? `CAC réel environ ${eur(real.estimate)}`
      : real.bestCase !== null
        ? `CAC réel au moins ${eur(real.bestCase)}`
        : null,
    real.estimate !== null && real.bestCase !== null
      ? `au mieux ${eur(real.bestCase)}`
      : null,
    `idéal ${eur(t.ideal)}`,
    `max ${eur(t.max)}`,
  ]
    .filter(Boolean)
    .join(", ")}.${real.verdict === "none" ? "" : ` ${VERDICTS[real.verdict].label}.`}`;

  return (
    <Card className="p-5 md:p-6">
      <Head
        icon={Megaphone}
        title="CAC réel des campagnes"
        sub={
          real.from && real.to
            ? `iOS + Android · jours comptés : ${real.from === real.to ? shortDay(real.from) : `${shortDay(real.from)} → ${shortDay(real.to)}`}`
            : "iOS + Android · jours de dépense de la période"
        }
        aside={<Chip verdict={real.verdict} />}
      />

      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          key={figure ?? real.total}
          className={cn(
            "figures leading-none font-semibold tracking-[-0.035em] text-[var(--color-ink)]",
            figure ? "text-[32px]" : "text-[26px]",
            crossfade && "value-in",
          )}
        >
          {figure ?? `${eur(real.total)} dépensés`}
        </span>
        <span className="text-[13px] text-[var(--color-ink-faint)]">
          {figure ? "par client payant" : "pour l'instant"}
        </span>
      </p>
      {distance ? (
        <p className="mt-2 text-[12.5px] text-[var(--color-ink-soft)]">{distance}</p>
      ) : null}

      {judged && t.available ? (
        <Scale targets={t} real={real} label={scaleLabel} />
      ) : null}

      <div className="mt-3 space-y-1 text-[12px] leading-snug text-[var(--color-ink-faint)]">
        {counted ? <p className="figures">{counted}</p> : null}
        {real.estimate !== null && real.bestCase !== null ? (
          <p>
            Au mieux, avec tous les nouveaux payants venus des pubs (et une
            marge pour le hasard) :{" "}
            <span className="figures">{eur(real.bestCase)}</span>
          </p>
        ) : null}
        {judged && real.pending > 0 ? (
          <p>
            <span className="figures">{eur(real.pending)}</span> dépensés ces 7
            derniers jours : comptés dès que leurs achats sont connus.
          </p>
        ) : null}
        {events ? <p>{events}</p> : null}
        {real.unread > 0 && real.verdict !== "unread" ? (
          <p>
            <span className="figures">{eur(real.unread)}</span> dépensés sur des
            jours sans relevé RevenueCat : pas comptés.
          </p>
        ) : null}
        {real.capped ? (
          <p>
            {real.cappedByAf
              ? "AppsFlyer compte plus d'achats que RevenueCat ne voit de nouveaux payants sur ces jours : estimation ramenée au total RevenueCat."
              : "Recalée sur RevenueCat, l'estimation dépassait tous les nouveaux payants de ces jours : ramenée à leur total."}
          </p>
        ) : null}
      </div>

      <p className="mt-3 text-[12.5px] leading-snug text-[var(--color-ink-soft)]">
        {advice}
      </p>

      <HowItWorks>
        <p>
          <b>≈</b> : les achats qu&apos;AppsFlyer attribue aux pubs, recalés sur
          les payants que voit RevenueCat (AppsFlyer en rate une partie).{" "}
          <b>Au mieux</b> : la dépense ÷ tous les nouveaux payants des jours de
          pub, comme s&apos;ils venaient tous des pubs, avec une marge pour le
          hasard (9 fois sur 10, il n&apos;y en a pas plus). Au-dessus du max,
          la campagne perd de l&apos;argent quoi que dise AppsFlyer.
        </p>
        <p>
          Le vrai CAC est entre les deux. Les 7 derniers jours sont exclus :
          leurs achats ne sont pas encore connus.
        </p>
        <p>
          Ads Manager calcule son propre coût par achat, sur d&apos;autres
          achats : ne le compare pas directement.
        </p>
      </HowItWorks>
    </Card>
  );
}

/* ------------------------------------------------------------- panel -- */

export function CacPanel({
  targets,
  real,
  paidInstalls,
}: {
  targets: CacTargets;
  /** Null when nothing was spent in the period. */
  real: CacReal | null;
  /** Installs AppsFlyer gives campaigns in the period. */
  paidInstalls: number;
}) {
  if (!real) {
    if (!targets.available) return null;
    const waiting =
      paidInstalls > 0
        ? `AppsFlyer voit ${plural(paidInstalls, "install", "installs")} de campagnes sur la période, mais aucune dépense : saisis-la plus bas pour voir leur CAC.`
        : "Pas de dépense sur la période : le CAC réel s'affichera ici dès qu'une campagne tourne.";
    return <TargetsCard targets={targets} wide waiting={waiting} />;
  }
  if (!targets.available) return <RealCard targets={targets} real={real} />;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <TargetsCard targets={targets} wide={false} waiting={null} />
      <RealCard targets={targets} real={real} />
    </div>
  );
}

/**
 * LTV per paying customer - realized since launch, and projected at 6 and 12
 * months - computed on the page from what the refresh stored. No server
 * import: this ships to the browser.
 *
 * The owners' rules: paying customers only; one global number, not per
 * cohort; 6 months and 1 year only ("not enough data beyond"); net (after VAT
 * and the stores' 15 % Small Business commission) as well as gross.
 *
 * The model was chosen on 2026-09-27 by a panel (three independent designs,
 * three judges, one synthesis): pooled renewals measured on finished months,
 * a cruising rate beyond them, an 80 % band, the projected share, an
 * out-of-sample check and a drift flag. Amplitude's usage retention is shown
 * next to it, never inside the euro figure: it has no payment event and
 * dormant subscribers keep paying.
 */

export interface LtvPlan {
  /** RevenueCat's product duration: P1M, P1Y, lifetime (one-time), Unknown... */
  duration: string;
  /** Since launch: revenue (refunds taken off), proceeds (after VAT and the stores' 15 %), payments (refunded ones included). */
  gross: number;
  net: number;
  transactions: number;
  /** First payments alone (transaction type "New"): their revenue and count. */
  firstGross: number;
  firstTransactions: number;
}

export interface LtvInputs {
  since: string;
  plans: LtvPlan[];
  /**
   * Monthly subscriptions by start month: how many started, and how many
   * were still paying at month m (m >= 1). The last cell of a cohort is
   * `complete: false`: RevenueCat then counts those set to renew.
   */
  monthlyRetention: {
    cohort: string;
    size: number;
    months: { m: number; count: number; complete: boolean }[];
  }[];
  /** Active annual subscriptions and those set to renew (shown only: none has renewed yet). */
  annualRenewal: { setToRenew: number; active: number } | null;
  /**
   * Active subscriptions by plan and month their period ends (YYYY-MM;
   * RevenueCat gives the month, not the day): set to renew, set to cancel,
   * in billing trouble. Absent from snapshots made before 2026-09-27.
   */
  expirations?: {
    plan: string;
    month: string;
    active: number;
    renew: number;
    cancel: number;
    billing: number;
  }[];
  /** Realized since launch: revenue and proceeds, and the paying customers they came from. */
  realized: { gross: number; net: number; payers: number };
}

/** One 30-day period after subscribers bought: how many used the app, of how many could have. */
export interface SubscriberUsageMonth {
  month: number;
  active: number;
  outOf: number;
  complete: boolean;
}

/* ------------------------------------------------------- constants -- */

export const HORIZONS = [6, 12] as const;
export type Horizon = (typeof HORIZONS)[number];
const LAST_MONTH = 11;

/** A month observed on fewer subscriptions than this is not measured. */
export const FLOOR = 10;
/** Pull of a measured month toward the cruising rate, in subscriptions. */
export const CREDIBILITY = 30;
const N1_MIN = 30;
const POOL_MIN = 60;
const CLAMP: [number, number] = [0.3, 0.97];
const H1_PRIOR = 0.55;
const HSS_PRIOR = 0.7;
/** The set-to-renew cap needs this many subscriptions behind it. */
const CAP_MIN = 30;
/** 80 % two-sided. */
const Z = 1.2816;
const PRICE_MIN_TX = 10;
const PHI_CAP = 4;
const DRIFT_Z = 2;
const DRIFT_MIN = 30;
/** Amplitude ratios are shown from this many subscribers on. */
const USAGE_MIN = 30;

/**
 * A subscription's period in months, from RevenueCat's ISO duration (P1M,
 * P1Y, P4W, P3D...); undefined for anything else ("lifetime", "Unknown"),
 * which is valued as a one-time purchase.
 */
function durationMonths(duration: string): number | undefined {
  const m = /^P(\d+)([DWMY])$/.exec(duration);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!(n > 0)) return undefined;
  const unit = m[2];
  return unit === "D"
    ? n / 30.4375
    : unit === "W"
      ? (n * 7) / 30.4375
      : unit === "M"
        ? n
        : n * 12;
}
const PLAN_LABEL: Record<string, string> = {
  P1W: "Hebdomadaire",
  P1M: "Mensuel",
  P2M: "2 mois",
  P3M: "Trimestriel",
  P6M: "Semestriel",
  P1Y: "Annuel",
  lifetime: "Achat unique",
};

const clamp = (x: number) => Math.min(CLAMP[1], Math.max(CLAMP[0], x));
const perHorizon = (f: (h: Horizon) => number): Record<Horizon, number> => ({
  6: f(6),
  12: f(12),
});

/* ------------------------------------------------------ monthly curve -- */

type Cohort = LtvInputs["monthlyRetention"][number];

interface Rates {
  /** h[N] = chance of renewing into month N, N = 1..LAST_MONTH (index 0 unused). */
  h: number[];
  /** Effective number of subscriptions behind each h[N], for the band. */
  nEff: number[];
  cruise: number;
  pool: { atRisk: number; renewed: number };
  first: { atRisk: number; renewed: number };
  pooled: Map<number, { atRisk: number; renewed: number }>;
  /**
   * Months 1..kObs are all measured (month 1 on at least N1_MIN
   * subscriptions, the others on at least FLOOR); from kObs + 1 on, the
   * curve is projected.
   */
  kObs: number;
  /** Whether a month's rate rests on a reference value rather than data. */
  fromPrior: (m: number) => boolean;
  flags: { insufficient: boolean; capped: boolean; clamped: boolean };
}

/** Pooled Kaplan-Meier: for each month, the cohorts that finished it, numerator and denominator from the same cohorts. */
function poolCells(
  cohorts: Cohort[],
  keep: (cohort: Cohort, m: number) => boolean,
) {
  const pooled = new Map<number, { atRisk: number; renewed: number }>();
  for (const c of cohorts) {
    let before = c.size;
    for (const cell of c.months) {
      if (!cell.complete || !keep(c, cell.m)) break;
      const acc = pooled.get(cell.m) ?? { atRisk: 0, renewed: 0 };
      acc.atRisk += before;
      acc.renewed += cell.count;
      pooled.set(cell.m, acc);
      before = cell.count;
    }
  }
  return pooled;
}

function estimateRates(
  cohorts: Cohort[],
  keep: (cohort: Cohort, m: number) => boolean,
  useCap: boolean,
): Rates {
  const pooled = poolCells(cohorts, keep);
  const flags = { insufficient: false, capped: false, clamped: false };
  const first = pooled.get(1) ?? { atRisk: 0, renewed: 0 };
  const pool = [...pooled.entries()]
    .filter(([m, v]) => m >= 2 && v.atRisk >= FLOOR)
    .reduce(
      (a, [, v]) => ({
        atRisk: a.atRisk + v.atRisk,
        renewed: a.renewed + v.renewed,
      }),
      {
        atRisk: 0,
        renewed: 0,
      },
    );
  let hss: number;
  if (pool.atRisk >= POOL_MIN) hss = pool.renewed / pool.atRisk;
  else {
    hss = HSS_PRIOR;
    flags.insufficient = true;
  }

  // Cap: of the subscriptions past their first renewal whose month is still
  // running, the share set to renew - the tail cannot keep more than that.
  let capNum = 0;
  let capDen = 0;
  if (useCap) {
    for (const c of cohorts) {
      const open = c.months.find((cell) => !cell.complete);
      if (!open || open.m < 2) continue;
      const lastDone = c.months
        .filter((cell) => cell.complete && cell.m < open.m)
        .at(-1);
      if (!lastDone) continue;
      capNum += open.count;
      capDen += lastDone.count;
    }
  }
  const cap = capDen >= CAP_MIN ? capNum / capDen : null;
  let cruise = hss;
  if (cap !== null && cap < hss) {
    cruise = cap;
    flags.capped = true;
  }

  const h: number[] = [0];
  const nEff: number[] = [0];
  let kObs = 0;
  for (let m = 1; m <= LAST_MONTH; m++) {
    const cell = pooled.get(m);
    let rate: number;
    let n: number;
    if (m === 1) {
      if (first.atRisk >= N1_MIN) {
        rate = first.renewed / first.atRisk;
        n = first.atRisk;
      } else {
        rate = H1_PRIOR;
        n = FLOOR;
        flags.insufficient = true;
      }
    } else if (cell && cell.atRisk >= FLOOR) {
      rate = (cell.renewed + CREDIBILITY * hss) / (cell.atRisk + CREDIBILITY);
      n = cell.atRisk;
    } else {
      rate = cruise;
      // The band's width follows what the cruising rate stands on: the pool,
      // the cap's subscriptions, or next to nothing for the reference value.
      n = flags.capped ? capDen : pool.atRisk >= POOL_MIN ? pool.atRisk : FLOOR;
    }
    // Measured months, counted from month 1 without a gap (month 1 needs
    // N1_MIN, below which the reference value is used).
    const measured =
      m === 1 ? first.atRisk >= N1_MIN : !!cell && cell.atRisk >= FLOOR;
    if (measured && kObs === m - 1) kObs = m;
    const bounded = clamp(rate);
    if (bounded !== rate) flags.clamped = true;
    h.push(bounded);
    nEff.push(n);
  }
  const fromPrior = (m: number) =>
    m === 1 ? first.atRisk < N1_MIN : pool.atRisk < POOL_MIN;
  return { h, nEff, cruise, pool, first, pooled, kObs, fromPrior, flags };
}

/** S[N] = chance a monthly subscriber still pays in month N, N = 0..LAST_MONTH. */
function survivalOf(h: number[]): number[] {
  const s = [1];
  for (let m = 1; m <= LAST_MONTH; m++) s.push((s[m - 1] ?? 0) * (h[m] ?? 0));
  return s;
}

/** Survival at a fractional age t (months), for plans shorter than a month or several months long. */
function survivalAt(s: number[], h: number[], t: number): number {
  const whole = Math.floor(t);
  if (whole >= LAST_MONTH) return s[LAST_MONTH] ?? 0;
  const frac = t - whole;
  return (s[whole] ?? 0) * (frac > 0 ? (h[whole + 1] ?? 0) ** frac : 1);
}

/* -------------------------------------------------------- the money -- */

export interface PlanValue {
  duration: string;
  label: string;
  /** Share of first purchases. */
  weight: number;
  firstPrice: number;
  renewalPrice: number;
  /** Net ÷ gross for this plan (VAT and the stores' 15 %). */
  netRatio: number;
  payments: Record<Horizon, number>;
  /** Of those, the payments at ages past the last measured month (projected). */
  projectedPayments: Record<Horizon, number>;
  gross: Record<Horizon, number>;
  net: Record<Horizon, number>;
  /** Priced from few sales, or from the monthly curve rather than its own renewals. */
  note: string | null;
  /** A one-time purchase (no period), rather than a subscription. */
  oneTime: boolean;
}

/** "P4W" -> "4 semaines": a readable name for a period without its own label. */
function periodLabel(duration: string): string {
  const m = /^P(\d+)([DWMY])$/.exec(duration);
  if (!m) return duration;
  const n = Number(m[1]);
  const unit = { D: "jour", W: "semaine", M: "mois", Y: "an" }[m[2] as "D" | "W" | "M" | "Y"];
  return `${n} ${unit}${n > 1 && unit !== "mois" ? "s" : ""}`;
}

function valuePlans(
  plans: LtvPlan[],
  s: number[],
  h: number[],
  kObs: number,
): PlanValue[] {
  const totalGross = plans.reduce((n, p) => n + p.gross, 0);
  const totalNet = plans.reduce((n, p) => n + p.net, 0);
  const globalRatio = totalGross > 0 ? totalNet / totalGross : 0;

  const valued = plans
    .filter((p) => p.transactions > 0)
    .map((p) => {
      const months = durationMonths(p.duration);
      // First purchases: "New" payments of a subscription, every sale of a one-time purchase.
      const firsts =
        months === undefined ? p.transactions : p.firstTransactions;
      const firstPrice =
        months !== undefined && p.firstTransactions > 0
          ? p.firstGross / p.firstTransactions
          : p.gross / p.transactions;
      const renewals = p.transactions - p.firstTransactions;
      const renewalPrice =
        months !== undefined && renewals >= PRICE_MIN_TX
          ? (p.gross - p.firstGross) / renewals
          : firstPrice;
      const netRatio =
        p.transactions >= PRICE_MIN_TX && p.gross > 0
          ? p.net / p.gross
          : globalRatio;
      let note: string | null =
        p.transactions < PRICE_MIN_TX
          ? "peu de ventes : prix à confirmer"
          : null;
      // Payment j happens at age j × period: its chance is the monthly curve
      // at that age (for the monthly plan, the curve itself; other periods
      // borrow it). A plan at least H months long pays once.
      const projectedPayments = perHorizon(() => 0);
      const payments = perHorizon((horizon) => {
        if (months === undefined || months >= horizon) return 1;
        if (months !== 1) note = note ?? "estimé d'après le mensuel";
        let e = 0;
        for (let j = 0; j * months < horizon; j++) {
          const age = j * months;
          const chance = survivalAt(s, h, age);
          e += chance;
          if (age > kObs) projectedPayments[horizon] += chance;
        }
        return e;
      });
      const gross = perHorizon(
        (horizon) => firstPrice + renewalPrice * (payments[horizon] - 1),
      );
      return {
        duration: p.duration,
        label:
          PLAN_LABEL[p.duration] ??
          (months === undefined ? "Achat unique" : periodLabel(p.duration)),
        oneTime: months === undefined,
        firsts,
        firstPrice,
        renewalPrice,
        netRatio,
        payments,
        projectedPayments,
        gross,
        net: perHorizon((horizon) => gross[horizon] * netRatio),
        note,
      };
    })
    .filter((p) => p.firsts > 0);
  const totalFirsts = valued.reduce((n, p) => n + p.firsts, 0);
  return valued.map(({ firsts, ...p }) => ({
    ...p,
    weight: totalFirsts > 0 ? firsts / totalFirsts : 0,
  }));
}

const blend = (plans: PlanValue[], key: "gross" | "net") =>
  perHorizon((horizon) =>
    plans.reduce((n, p) => n + p.weight * p[key][horizon], 0),
  );

/** Wilson interval (80 %) centered on the rate actually used. */
function wilson(p: number, n: number): [number, number] {
  if (n <= 0) return [p, p];
  const z2 = Z * Z;
  const center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half =
    (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [clamp(center - half), clamp(center + half)];
}

/* ------------------------------------------------------------ result -- */

export interface LtvProjection {
  gross: Record<Horizon, number>;
  net: Record<Horizon, number>;
  /** 80 % band: every rate at the low, then the high end of its interval (errors taken as fully correlated, on purpose wide). */
  band: {
    gross: Record<Horizon, [number, number]>;
    net: Record<Horizon, [number, number]>;
  };
  /** Share of the gross figure coming from months not observed yet. */
  projectedShare: Record<Horizon, number>;
  plans: PlanValue[];
  monthly: {
    /** S[0..11], and whether each month was measured. */
    survival: {
      m: number;
      value: number;
      measured: boolean;
      atRisk: number;
      renewed: number;
    }[];
    firstRenewal: { rate: number; atRisk: number; renewed: number };
    cruise: number;
    cruiseBasis: { atRisk: number; renewed: number };
    subscriptions: number;
  };
  realized: { payers: number; gross: number | null; net: number | null };
  annualSetToRenew: number | null;
  /** Rebuilt without the last finished calendar month, the model's guess for it against what happened. */
  check: {
    month: string;
    predicted: number;
    observed: number;
    outOfRange: boolean;
  } | null;
  drift: {
    direction: "up" | "down";
    status: "contradicted" | "confirmed" | "unconfirmed";
  } | null;
  flags: { insufficient: boolean; capped: boolean; clamped: boolean };
}

const addMonths = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
    .toISOString()
    .slice(0, 7);
};

/** The first renewal's spread between cohorts beyond chance (1 = none), to widen its interval. */
function dispersion(cohorts: Cohort[]): number {
  const firstCohorts = cohorts.filter(
    (c) => c.size >= FLOOR && c.months[0]?.complete,
  );
  if (firstCohorts.length < 2) return 1;
  const size = firstCohorts.reduce((n, c) => n + c.size, 0);
  const p =
    firstCohorts.reduce((n, c) => n + (c.months[0]?.count ?? 0), 0) / size;
  const chi2 = firstCohorts.reduce((n, c) => {
    const expected = c.size * p;
    const variance = expected * (1 - p);
    return variance > 0
      ? n + ((c.months[0]?.count ?? 0) - expected) ** 2 / variance
      : n;
  }, 0);
  return Math.max(1, Math.min(PHI_CAP, chi2 / (firstCohorts.length - 1)));
}

export function projectLtv(inputs: LtvInputs): LtvProjection {
  const cohorts = inputs.monthlyRetention;
  const rates = estimateRates(cohorts, () => true, true);
  const s = survivalOf(rates.h);
  const plans = valuePlans(inputs.plans, s, rates.h, rates.kObs);
  const gross = blend(plans, "gross");
  const net = blend(plans, "net");

  // Band: all rates low, then all high.
  const phi = dispersion(cohorts);
  const bound = (side: 0 | 1) => {
    const hb = rates.h.map((rate, m) => {
      if (m === 0) return 0;
      const n =
        m === 1 && rates.first.atRisk >= N1_MIN
          ? rates.first.atRisk / phi
          : (rates.nEff[m] ?? FLOOR);
      return wilson(rate, n)[side];
    });
    const sb = survivalOf(hb);
    const pb = valuePlans(inputs.plans, sb, hb, rates.kObs);
    return { gross: blend(pb, "gross"), net: blend(pb, "net") };
  };
  const low = bound(0);
  const high = bound(1);

  // Every plan's renewals at ages not measured yet, over the whole figure.
  const projectedShare = perHorizon((horizon) =>
    gross[horizon] > 0
      ? plans.reduce(
          (n, p) =>
            n + p.weight * p.renewalPrice * p.projectedPayments[horizon],
          0,
        ) / gross[horizon]
      : 0,
  );

  // Out-of-sample check: the last calendar month holding finished cells,
  // predicted from the months before it (without the cap).
  let check: LtvProjection["check"] = null;
  const cellMonth = (c: Cohort, m: number) => addMonths(c.cohort, m);
  const lastMonth = cohorts
    .flatMap((c) =>
      c.months
        .filter((cell) => cell.complete)
        .map((cell) => cellMonth(c, cell.m)),
    )
    .sort()
    .at(-1);
  if (lastMonth) {
    const past = estimateRates(
      cohorts,
      (c, m) => cellMonth(c, m) < lastMonth,
      false,
    );
    let predicted = 0;
    let observed = 0;
    let variance = 0;
    // A prediction resting on reference values would test those, not the model.
    let fromPrior = false;
    for (const c of cohorts) {
      c.months.forEach((cell, i) => {
        if (!cell.complete || cellMonth(c, cell.m) !== lastMonth) return;
        const before = i === 0 ? c.size : (c.months[i - 1]?.count ?? 0);
        const rate = past.h[cell.m] ?? past.cruise;
        if (past.fromPrior(cell.m)) fromPrior = true;
        predicted += before * rate;
        observed += cell.count;
        variance += before * rate * (1 - rate);
      });
    }
    if (predicted > 0 && !fromPrior) {
      check = {
        month: lastMonth,
        predicted,
        observed,
        outOfRange: Math.abs(observed - predicted) > 2 * Math.sqrt(variance),
      };
    }
  }

  // Drift of the first renewal: the two youngest cohorts that finished
  // month 1 against the older ones. It never changes the figure.
  let drift: LtvProjection["drift"] = null;
  const withM1 = cohorts
    .filter((c) => c.months[0]?.complete)
    .sort((a, b) => a.cohort.localeCompare(b.cohort));
  const recent = withM1.slice(-2);
  const older = withM1.slice(0, -2);
  const total = (list: Cohort[], f: (c: Cohort) => number) =>
    list.reduce((n, c) => n + f(c), 0);
  const nRec = total(recent, (c) => c.size);
  const nOld = total(older, (c) => c.size);
  if (nRec >= DRIFT_MIN && nOld > 0) {
    const pRec = total(recent, (c) => c.months[0]?.count ?? 0) / nRec;
    const pOld = total(older, (c) => c.months[0]?.count ?? 0) / nOld;
    const p = (pRec * nRec + pOld * nOld) / (nRec + nOld);
    const se = Math.sqrt(p * (1 - p) * (1 / nRec + 1 / nOld));
    const z = se > 0 ? (pRec - pOld) / se : 0;
    if (Math.abs(z) > DRIFT_Z) {
      // The youngest cohort still in its first month: those set to renew are an upper bound.
      const youngest = cohorts
        .filter((c) => c.months[0] && !c.months[0].complete && c.size > 0)
        .sort((a, b) => a.cohort.localeCompare(b.cohort))
        .at(-1);
      // Tested against the rate the trend claims, with the cohort's own
      // uncertainty, and only on a cohort big enough to say anything.
      const direction = z > 0 ? "up" : "down";
      let status: "contradicted" | "confirmed" | "unconfirmed" = "unconfirmed";
      if (youngest && youngest.size >= FLOOR) {
        const u1 = (youngest.months[0]?.count ?? 0) / youngest.size;
        const upper = wilson(u1, youngest.size)[1];
        if (direction === "up" && upper < pRec) status = "contradicted";
        if (direction === "down" && upper < pOld) status = "confirmed";
      }
      drift = { direction, status };
    }
  }

  const payers = inputs.realized.payers;
  return {
    gross,
    net,
    band: {
      gross: {
        6: [low.gross[6], high.gross[6]],
        12: [low.gross[12], high.gross[12]],
      },
      net: { 6: [low.net[6], high.net[6]], 12: [low.net[12], high.net[12]] },
    },
    projectedShare,
    plans,
    monthly: {
      survival: s.map((value, m) => {
        const cell = rates.pooled.get(m);
        return {
          m,
          value,
          measured: m <= rates.kObs,
          atRisk: cell?.atRisk ?? 0,
          renewed: cell?.renewed ?? 0,
        };
      }),
      firstRenewal: { rate: rates.h[1] ?? 0, ...rates.first },
      cruise: rates.cruise,
      cruiseBasis: rates.pool,
      subscriptions: cohorts.reduce((n, c) => n + c.size, 0),
    },
    realized: {
      payers,
      gross: payers > 0 ? inputs.realized.gross / payers : null,
      net: payers > 0 ? inputs.realized.net / payers : null,
    },
    annualSetToRenew:
      inputs.annualRenewal && inputs.annualRenewal.active > 0
        ? inputs.annualRenewal.setToRenew / inputs.annualRenewal.active
        : null,
    check,
    drift,
    flags: rates.flags,
  };
}

/* -------------------------------------------------------- amplitude -- */

export interface SubscriberEngagement {
  /** Share of buyers still using the app at months 1 and 3 (Amplitude's 30-day periods). */
  monthly: { month1: number | null; month3: number | null };
  annual: { month1: number | null; month3: number | null };
  /** Among monthly subscribers still paying (RevenueCat), the share still opening the app. */
  payingActive: { month: number; share: number }[];
}

/**
 * Amplitude's usage retention of subscribers, for display: it never enters
 * the euro figure (no payment event; usage and payment do not move
 * together). Its periods are 30-day windows where RevenueCat counts calendar
 * months, and the two do not match people one to one: an indicator.
 */
export function subscriberEngagement(
  usage: Record<"monthly" | "annual", SubscriberUsageMonth[] | null> | null,
  inputs: LtvInputs | null,
): SubscriberEngagement | null {
  if (!usage) return null;
  const share = (rows: SubscriberUsageMonth[] | null, month: number) => {
    const row = rows?.find((r) => r.month === month);
    return row && row.complete && row.outOf >= USAGE_MIN
      ? row.active / row.outOf
      : null;
  };
  const payingActive: SubscriberEngagement["payingActive"] = [];
  if (inputs && usage.monthly) {
    const pooled = poolCells(inputs.monthlyRetention, () => true);
    let paidSurvival = 1;
    for (let m = 1; m <= LAST_MONTH; m++) {
      const cell = pooled.get(m);
      if (!cell || cell.atRisk < USAGE_MIN) break;
      paidSurvival *= cell.renewed / cell.atRisk;
      const row = usage.monthly.find((r) => r.month === m);
      if (
        !row ||
        !row.complete ||
        row.outOf < USAGE_MIN ||
        row.active < FLOOR ||
        paidSurvival <= 0
      )
        continue;
      payingActive.push({
        month: m,
        share: Math.min(1, row.active / row.outOf / paidSurvival),
      });
    }
  }
  const out = {
    monthly: {
      month1: share(usage.monthly, 1),
      month3: share(usage.monthly, 3),
    },
    annual: { month1: share(usage.annual, 1), month3: share(usage.annual, 3) },
    payingActive,
  };
  const none =
    out.monthly.month1 === null &&
    out.monthly.month3 === null &&
    out.annual.month1 === null &&
    out.annual.month3 === null &&
    payingActive.length === 0;
  return none ? null : out;
}

/* ------------------------------------------------------- upcoming -- */

export interface UpcomingPlan {
  plan: string;
  label: string;
  /** Expected in the window: ends of period, renewals (set to renew), churn (set to cancel), billing trouble. */
  ending: number;
  renew: number;
  cancel: number;
  billing: number;
  /** Renewals × the plan's renewal price, gross and net. */
  gross: number;
  net: number;
}

export interface Upcoming {
  from: string;
  to: string;
  days: number;
  plans: UpcomingPlan[];
  /** Part of the figures that is a pro-rata estimate (a month only partly in the window). */
  estimated: boolean;
}

const MS_DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The subscriptions whose period ends in the next `days` days, from
 * RevenueCat's counts by month of expiration: the whole of a month when the
 * window covers the rest of it, otherwise its share of days (ends are spread
 * over the month - monthly ones renew on their start day).
 */
export function upcomingRenewals(
  inputs: LtvInputs,
  today: string,
  days = 10,
): Upcoming | null {
  const rows = inputs.expirations;
  if (!rows || rows.length === 0) return null;
  const from = today;
  const to = iso(utc(today) + (days - 1) * MS_DAY);
  let estimated = false;
  const byPlan = new Map<string, UpcomingPlan>();
  for (const row of rows) {
    const monthStart = `${row.month}-01`;
    const [y, m] = row.month.split("-").map(Number);
    const monthEnd = iso(Date.UTC(y ?? 1970, m ?? 1, 0));
    // Still-active subscriptions of the current month end between today and its last day.
    const start = monthStart > today ? monthStart : today;
    if (start > monthEnd || start > to) continue;
    const span = (utc(monthEnd) - utc(start)) / MS_DAY + 1;
    const inWindow =
      (utc(monthEnd < to ? monthEnd : to) - utc(start)) / MS_DAY + 1;
    const share = Math.min(1, inWindow / span);
    if (share < 1) estimated = true;
    const plan = inputs.plans.find((p) => p.duration === row.plan);
    const renewalPrice = plan
      ? plan.transactions - plan.firstTransactions >= 10
        ? (plan.gross - plan.firstGross) /
          (plan.transactions - plan.firstTransactions)
        : plan.firstTransactions > 0
          ? plan.firstGross / plan.firstTransactions
          : plan.gross / Math.max(1, plan.transactions)
      : 0;
    const netRatio = plan && plan.gross > 0 ? plan.net / plan.gross : 0;
    const acc = byPlan.get(row.plan) ?? {
      plan: row.plan,
      label: PLAN_LABEL[row.plan] ?? row.plan,
      ending: 0,
      renew: 0,
      cancel: 0,
      billing: 0,
      gross: 0,
      net: 0,
    };
    acc.ending += row.active * share;
    acc.renew += row.renew * share;
    acc.cancel += row.cancel * share;
    acc.billing += row.billing * share;
    acc.gross += row.renew * share * renewalPrice;
    acc.net += row.renew * share * renewalPrice * netRatio;
    byPlan.set(row.plan, acc);
  }
  return { from, to, days, plans: [...byPlan.values()], estimated };
}

/**
 * What a paying customer may cost to acquire, and what the campaigns really
 * paid - the two figures at the top of the Performances page.
 *
 * Targets come from the LTV per paying customer (lib/performance/ltv.ts), net
 * of VAT, store commission and refunds, and are recomputed at every reading:
 *   - maximum = the low end of the 12-month net LTV's 80 % band: a payer who
 *     cost that much pays back within a year even with every retention rate
 *     at the bottom of its interval;
 *   - ideal = the central 12-month net LTV ÷ 1.5 (at least 1.50 € back per
 *     euro spent in a year), and never closer than 15 % to the maximum.
 * The annual plans' renewal and the months past 12 are left out on purpose:
 * that is the safety margin (ad payers often retain less than organic ones).
 *
 * The real CAC counts paying customers the way the LTV does - RevenueCat's
 * new payers - and only on "mature" ad days (a week old: a user can still pay
 * within 7 days of arriving). Two readings bound the truth:
 *   - an estimate: purchases AppsFlyer attributes to campaigns, scaled up by
 *     how many payers RevenueCat sees for each purchase AppsFlyer sees (its
 *     event tracking misses some), never more than all new payers;
 *   - a best case: the spend divided by (a generous upper bound of) all the
 *     new payers of those days, as if every one of them came from the ads.
 * If even the best case is above the maximum, the campaign loses money,
 * whatever attribution says.
 *
 * No server import here: this module ships to the client.
 */

import type { LtvProjection } from "@/lib/performance/ltv";
import {
  addDays,
  afEventsFrom,
  afPurchases,
  daysOf,
  Series,
  spendByDay,
  type PerfPayload,
  type Range,
} from "@/lib/performance/compute";

/* ------------------------------------------------------------ targets -- */

export interface CacTargets {
  available: boolean;
  /** Whole euros, rounded down: they are ceilings. */
  max: number;
  ideal: number;
  /** The 12-month net LTV the targets come from: central, and its 80 % band. */
  ltv12: number;
  ltv12Low: number;
  ltv12High: number;
  /** Months until a payer who cost that much has paid it back (0 = at the first payment). */
  paybackIdeal: number | null;
  paybackMax: number | null;
  /** The cost per install that fits under the maximum, at the current purchase rate. */
  cpiMax: number | null;
  /** New users who pay within 7 days, last 90 complete days. */
  convRate: number | null;
  notes: {
    provisional: boolean;
    driftDown: boolean;
    fragile: boolean;
    capped: boolean;
  };
}

/**
 * Net money a paying customer has brought after `m` months (0 = the first
 * payment): each plan by its share of first purchases; monthly plans renew
 * along the measured-then-projected survival curve, the others count their
 * first payment only (prudent).
 */
function cumulativeNet(ltv: LtvProjection, m: number): number {
  let total = 0;
  for (const p of ltv.plans) {
    let paid = p.firstPrice;
    if (p.duration === "P1M") {
      for (let j = 1; j <= m; j++) paid += p.renewalPrice * (ltv.monthly.survival[j]?.value ?? 0);
    }
    total += p.weight * p.netRatio * paid;
  }
  return total;
}

export function paybackMonths(ltv: LtvProjection, cac: number): number | null {
  for (let m = 0; m < 12; m++) if (cumulativeNet(ltv, m) >= cac) return m;
  return null;
}

export function cacTargets(ltv: LtvProjection | null, payload: PerfPayload): CacTargets {
  const none: CacTargets = {
    available: false,
    max: 0,
    ideal: 0,
    ltv12: 0,
    ltv12Low: 0,
    ltv12High: 0,
    paybackIdeal: null,
    paybackMax: null,
    cpiMax: null,
    convRate: null,
    notes: { provisional: false, driftDown: false, fragile: false, capped: false },
  };
  if (!ltv) return none;
  const [low, high] = ltv.band.net[12];
  const mid = ltv.net[12];
  if (!Number.isFinite(low) || !Number.isFinite(mid) || low < 2 || mid <= 0) return none;
  const max = Math.floor(low);
  const ideal = Math.floor(Math.min(mid / 1.5, 0.85 * low));
  if (ideal < 1) return none;

  // The CPI that fits under the maximum, at the purchase rate of the last 90
  // complete days (new users who paid within 7 days).
  const s = new Series(payload.series);
  const end = addDays(payload.today, -8);
  const window = { from: addDays(end, -89), to: end };
  const payers = s.sum("revenuecat:conv_paying_7d", window);
  const users = s.sum("revenuecat:conv_new_customers", window);
  const convRate = payers >= 20 && users > 0 ? payers / users : null;

  return {
    available: true,
    max,
    ideal,
    ltv12: mid,
    ltv12Low: low,
    ltv12High: high,
    paybackIdeal: paybackMonths(ltv, ideal),
    paybackMax: paybackMonths(ltv, max),
    cpiMax: convRate === null ? null : Math.floor(max * convRate * 100) / 100,
    convRate,
    notes: {
      provisional: ltv.flags.insufficient,
      driftDown: ltv.drift?.direction === "down",
      fragile: ltv.projectedShare[12] > 0.25,
      capped: ltv.flags.capped || ltv.flags.clamped,
    },
  };
}

/* --------------------------------------------------------------- real -- */

/**
 * The one-sided 90 % upper bound of a Poisson count of `n`: with n payers
 * seen, the true rate is below this 9 times out of 10.
 */
export function upper90(n: number): number {
  const table = [2.3, 3.89, 5.32, 6.68, 7.99, 9.27, 10.53, 11.77, 13.0, 14.21, 15.41];
  if (n <= 10) return table[Math.max(0, Math.round(n))]!;
  const a = n + 1;
  return a * (1 - 1 / (9 * a) + 1.2816 / (3 * Math.sqrt(a))) ** 3;
}

export type CacVerdict =
  | "good"
  | "thin"
  | "over"
  | "confirm"
  | "early"
  | "little"
  | "unread"
  | "none";

/** Before a verdict: nothing to judge yet, so no CAC figure either. */
export const judged = (v: CacVerdict) =>
  v !== "early" && v !== "little" && v !== "unread";

export interface CacReal {
  /** All the spend of the period, whatever happens to it below. */
  total: number;
  /** Spend on the complete days counted, and on the last 7 days (not judged yet). */
  spent: number;
  pending: number;
  /** Spend on complete days RevenueCat has no reading for: not counted. */
  unread: number;
  /** The complete days counted, and all the new payers of those days (RevenueCat). */
  from: string | null;
  to: string | null;
  days: number;
  payers: number;
  /** Purchases AppsFlyer gives the ads, on the counted days it has events for. */
  attributed: number;
  daysWithEvents: number;
  /**
   * The estimate reads the days with AppsFlyer events only: their spend and
   * payers, and the spend of the counted days before them (left out of it).
   */
  estSpent: number;
  estPayers: number;
  skipped: number;
  /** Payers the ads brought, estimated; the CAC it gives; the best case. Null before a verdict. */
  adPayers: number | null;
  estimate: number | null;
  bestCase: number | null;
  verdict: CacVerdict;
  /** For "early": the day the 30-day period first has enough complete spend to judge. */
  verdictOn: string | null;
  /** AppsFlyer events only from this day. */
  eventsFrom: string | null;
  /** The estimate went past all the new payers of its days: brought back to their number. */
  capped: boolean;
  /** ...because AppsFlyer itself counts more purchases than RevenueCat payers. */
  cappedByAf: boolean;
  /** AppsFlyer gives the ads purchases, but RevenueCat saw no new payer those days. */
  noPayers: boolean;
  /** Complete ad days in the last 30, outside the period: a longer period would judge them. */
  matureElsewhere: boolean;
}

/** A CAC as shown: whole euros, one decimal under 10 €. */
export const shownCac = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
/** The best case as shown: rounded down, so it never flatters. */
const shownFloor = (v: number) => (v < 10 ? Math.floor(v * 10) / 10 : Math.floor(v));
/** Money to the cent: an entry spread over its days must add back up exactly. */
const cents = (v: number) => Math.round(v * 100) / 100;

export function cacReal(payload: PerfPayload, r: Range, targets: CacTargets): CacReal {
  const s = new Series(payload.series);
  const spend = spendByDay(payload, r, "all");
  const cutoff = addDays(payload.today, -8);
  const rc = payload.series["revenuecat:conv_paying_7d"] ?? {};
  const paid = [
    payload.series["appsflyer:purchases_paid_ios"] ?? {},
    payload.series["appsflyer:purchases_paid_android"] ?? {},
  ];
  const eventsFrom = afEventsFrom(payload);
  const sum = (days: string[], of: (d: string) => number) =>
    days.reduce((n, d) => n + of(d), 0);
  const spendOn = (d: string) => spend.get(d) ?? 0;
  const payersOn = (d: string) => rc[d] ?? 0;
  const threshold = targets.available ? targets.max : 20;

  // Complete ad days (a week old: their payers are known) that RevenueCat has read.
  const mature: string[] = [];
  let pending = 0;
  let unread = 0;
  let total = 0;
  for (const d of daysOf(r)) {
    const sp = spendOn(d);
    if (sp <= 0) continue;
    total += sp;
    if (d > cutoff) pending += sp;
    else if (rc[d] !== undefined) mature.push(d);
    else unread += sp;
  }
  const spent = cents(sum(mature, spendOn));
  const payers = sum(mature, payersOn);
  // The best case needs no attribution: it reads every counted day.
  const floorR = mature.length > 0 && spent > 0 ? shownFloor(spent / upper90(payers)) : null;

  // The estimate needs AppsFlyer's events: it reads their days only.
  const withEvents = eventsFrom === null ? [] : mature.filter((d) => d >= eventsFrom);
  const attributed = sum(withEvents, (d) => (paid[0]![d] ?? 0) + (paid[1]![d] ?? 0));
  const estSpent = cents(sum(withEvents, spendOn));
  const estPayers = sum(withEvents, payersOn);

  // How many RevenueCat payers per purchase AppsFlyer sees, over 90 days.
  let scale = 1;
  const end = r.to < cutoff ? r.to : cutoff;
  if (eventsFrom !== null) {
    const start90 = addDays(end, -89);
    const start = start90 > eventsFrom ? start90 : eventsFrom;
    if (start <= end) {
      const seen = afPurchases(s, "all", { from: start, to: end });
      const all = sum(daysOf({ from: start, to: end }), payersOn);
      if (seen >= 20 && all > seen) scale = all / seen;
    }
  }
  const rawAdPayers = attributed * scale;
  // Only on enough spend of its own: a few euros after the events say nothing.
  const adPayers =
    attributed >= 5 && estPayers > 0 && estSpent >= threshold
      ? Math.min(rawAdPayers, estPayers)
      : null;
  const estR = adPayers !== null ? shownCac(estSpent / adPayers) : null;
  // The best case shown beside the estimate reads the same days, so it stays under it.
  const estFloorR = adPayers !== null ? shownFloor(estSpent / upper90(estPayers)) : null;

  const recent = addDays(payload.today, -30);
  let matureElsewhere = false;
  if (recent <= cutoff) {
    for (const [d, sp] of spendByDay(payload, { from: recent, to: cutoff }, "all")) {
      if (sp > 0 && (d < r.from || d > r.to)) {
        matureElsewhere = true;
        break;
      }
    }
  }

  let verdict: CacVerdict;
  let verdictOn: string | null = null;
  let estimate: number | null = null;
  let bestCase: number | null = null;
  if (mature.length === 0 || spent < threshold) {
    // Nothing to judge yet: RevenueCat still has to read complete days that
    // would be enough, or the spend is too recent, or too small.
    verdict =
      cents(spent + unread) >= threshold ? "unread" : pending > 0 ? "early" : "little";
    if (verdict === "early") {
      // The 30-day period on day d + 8 counts the complete days d - 22 to d:
      // the first recent day whose window holds enough spend.
      const all = spendByDay(payload, { from: addDays(cutoff, -21), to: payload.today }, "all");
      for (const d of daysOf({ from: addDays(cutoff, 1), to: payload.today })) {
        let run = 0;
        for (const w of daysOf({ from: addDays(d, -22), to: d })) run += all.get(w) ?? 0;
        if (cents(run) >= threshold) {
          verdictOn = addDays(d, 8);
          break;
        }
      }
    }
  } else if (!targets.available) {
    verdict = "none";
    estimate = estR;
    bestCase = estR !== null ? estFloorR : floorR;
  } else if (floorR !== null && floorR > targets.max) {
    // Too dear even with every new payer credited to the ads: whatever
    // AppsFlyer says, and on every counted day.
    verdict = "over";
    bestCase = floorR;
  } else if (estR !== null) {
    estimate = estR;
    bestCase = estFloorR;
    verdict =
      attributed < 10
        ? "confirm"
        : estR <= targets.ideal
          ? "good"
          : estR <= targets.max
            ? "thin"
            : "over";
  } else {
    verdict = "confirm";
    bestCase = floorR;
  }
  const withEstimate = estimate !== null;

  return {
    total: cents(total),
    spent,
    pending: cents(pending),
    unread: cents(unread),
    from: mature[0] ?? null,
    to: mature.at(-1) ?? null,
    days: mature.length,
    payers,
    attributed,
    daysWithEvents: withEvents.length,
    estSpent,
    estPayers,
    skipped: withEstimate ? cents(spent - estSpent) : 0,
    adPayers: withEstimate ? adPayers : null,
    estimate,
    bestCase,
    verdict,
    verdictOn,
    eventsFrom,
    capped: withEstimate && rawAdPayers > estPayers,
    cappedByAf: withEstimate && attributed > estPayers,
    noPayers: attributed >= 5 && estPayers === 0,
    matureElsewhere,
  };
}

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
  /** Spend on the days counted, and on the last 7 days (not judged yet). */
  spent: number;
  pending: number;
  /** Spend on complete days RevenueCat has no reading for: not counted. */
  unread: number;
  /** Spend on complete days before AppsFlyer's events, left out of an estimate. */
  skipped: number;
  /** The days counted. */
  from: string | null;
  to: string | null;
  days: number;
  /** All new payers of those days (RevenueCat), and the purchases AppsFlyer gives the ads. */
  payers: number;
  attributed: number;
  /** Complete ad days AppsFlyer has events for. */
  daysWithEvents: number;
  /** Payers the ads brought, estimated; the CAC it gives; the best case. Null before a verdict. */
  adPayers: number | null;
  estimate: number | null;
  bestCase: number | null;
  verdict: CacVerdict;
  /** For "early": the day the first verdict can come, if the campaign keeps spending. */
  verdictOn: string | null;
  /** AppsFlyer events only from this day. */
  eventsFrom: string | null;
  /** AppsFlyer gave the ads more payers than RevenueCat saw: brought back to RevenueCat's. */
  capped: boolean;
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
  const withEvents = eventsFrom === null ? [] : mature.filter((d) => d >= eventsFrom);
  const attributed = sum(withEvents, (d) => (paid[0]![d] ?? 0) + (paid[1]![d] ?? 0));
  const payersE = sum(withEvents, (d) => rc[d] ?? 0);

  // How many RevenueCat payers per purchase AppsFlyer sees, over 90 days.
  let scale = 1;
  const end = r.to < cutoff ? r.to : cutoff;
  if (eventsFrom !== null) {
    const start90 = addDays(end, -89);
    const start = start90 > eventsFrom ? start90 : eventsFrom;
    if (start <= end) {
      const seen = afPurchases(s, "all", { from: start, to: end });
      const all = sum(daysOf({ from: start, to: end }), (d) => rc[d] ?? 0);
      if (seen >= 20 && all > seen) scale = all / seen;
    }
  }
  const rawAdPayers = attributed * scale;
  const adPayers =
    attributed >= 5 && payersE > 0 ? Math.min(rawAdPayers, payersE) : null;

  // With an estimate, everything is read on the days it covers: the best case
  // then stays under it, and the figures on show divide into each other.
  const days = adPayers !== null ? withEvents : mature;
  const skipped = adPayers !== null ? sum(mature, spendOn) - sum(days, spendOn) : 0;
  const spent = cents(sum(days, spendOn));
  const payers = sum(days, (d) => rc[d] ?? 0);
  const estimate = adPayers !== null ? spent / adPayers : null;
  const bestCase = days.length > 0 && spent > 0 ? spent / upper90(payers) : null;

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

  const threshold = targets.available ? targets.max : 20;
  let verdict: CacVerdict;
  let verdictOn: string | null = null;
  const estR = estimate === null ? null : shownCac(estimate);
  const floorR = bestCase === null ? null : shownFloor(bestCase);
  if (days.length === 0 || spent < threshold) {
    verdict = pending > 0 ? "early" : unread > 0 ? "unread" : "little";
    // The day the spend reaches the threshold, plus the week its payers need.
    let run = 0;
    for (const d of daysOf(r)) {
      run = cents(run + spendOn(d));
      if (run >= threshold) {
        verdictOn = addDays(d, 8);
        break;
      }
    }
    if (verdictOn !== null && verdictOn <= payload.today) verdictOn = null;
  } else if (!targets.available) {
    verdict = "none";
  } else if (floorR !== null && floorR > targets.max) {
    verdict = "over";
  } else if (estR !== null && attributed >= 10) {
    verdict = estR <= targets.ideal ? "good" : estR <= targets.max ? "thin" : "over";
  } else {
    verdict = "confirm";
  }
  const show = judged(verdict);

  return {
    total: cents(total),
    spent,
    pending: cents(pending),
    unread: cents(unread),
    skipped: cents(skipped),
    from: days[0] ?? null,
    to: days.at(-1) ?? null,
    days: days.length,
    payers,
    attributed,
    daysWithEvents: withEvents.length,
    adPayers: show ? adPayers : null,
    estimate: show ? estR : null,
    bestCase: show ? floorR : null,
    verdict,
    verdictOn: verdict === "early" ? verdictOn : null,
    eventsFrom,
    capped: show && adPayers !== null && rawAdPayers > payersE,
    noPayers: attributed >= 5 && payersE === 0,
    matureElsewhere,
  };
}

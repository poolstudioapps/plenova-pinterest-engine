import "server-only";
import { config } from "@/lib/config";
import { getJson, sleep, utcDay } from "@/lib/performance/http";
import type { SubscriberUsageMonth } from "@/lib/performance/ltv";
import type { DailyPoint } from "@/lib/performance/store";
import { compareVersions, countedVersion } from "@/lib/performance/versions";

/**
 * Amplitude (project Plenova, US region): who uses the app and how the
 * onboarding and the purchase convert. Dashboard REST API, HTTP Basic with the
 * project's API key and secret key.
 *
 * Everything is stored per day so any period can be summed later: active and
 * new users and the rolling MAU and WAU (every version), then the conversion
 * figures of app 2.0.0 and later (lib/performance/versions.ts): new users,
 * buyers, and two funnels counted by the day users entered them (Amplitude's
 * `dayFunnels`):
 *  - onboarding: First App Open -> Onboarding Completed (the Home screen), 1 day;
 *  - purchase: First App Open -> Subscription Purchased within 7 days.
 * Days are the project's days. Numbers are small (about 15 buyers a month), so
 * the page shows counts next to rates.
 */

const SPACING_MS = 1200;
interface SeriesResponse {
  data?: { series?: number[][]; xValues?: string[] };
}

interface FunnelResponse {
  data?: { dayFunnels?: { series?: number[][]; xValues?: string[] } }[];
}

function headers(): Record<string, string> {
  const { apiKey, secretKey } = config.amplitude;
  return {
    Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`,
  };
}

function base(): string {
  const url = config.amplitude.baseUrl.replace(/\/+$/, "");
  // Only Amplitude's own hosts: the key pair must never be sent anywhere else.
  if (!/^https:\/\/(analytics\.eu\.)?amplitude\.com$/.test(url))
    throw new Error("AMPLITUDE_BASE_URL invalide");
  return url;
}

const compact = (day: string) => day.replaceAll("-", "");

/** "2026-09-01", "2026-09-01T00:00:00" or "Sep 1, 2026" -> "2026-09-01" (UTC). */
function toDay(x: string): string | null {
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(x)?.[1];
  if (direct) return direct;
  const parsed = Date.parse(`${x} UTC`);
  return Number.isFinite(parsed) ? utcDay(new Date(parsed)) : null;
}

async function call<T>(
  path: string,
  params: [string, string][],
  options: { timeoutMs?: number; attempts?: number } = {},
): Promise<T> {
  const query = params
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const data = await getJson<T>(
    "Amplitude",
    `${base()}${path}?${query}`,
    headers(),
    { timeoutMs: 60_000, ...options },
  );
  await sleep(SPACING_MS);
  return data;
}

function daily(res: SeriesResponse, metric: string, out: DailyPoint[]): void {
  const values = res.data?.series?.[0] ?? [];
  const days = res.data?.xValues ?? [];
  days.forEach((x, i) => {
    const day = toDay(x);
    const value = Number(values[i]);
    if (day && Number.isFinite(value))
      out.push({ day, source: "amplitude", metric, value });
  });
}

const event = (type: string, filters?: { key: string; values: string[] }[]) =>
  JSON.stringify({
    event_type: type,
    ...(filters
      ? {
          filters: filters.map((f) => ({
            subprop_type: "event",
            subprop_key: f.key,
            subprop_op: "is",
            subprop_value: f.values,
          })),
        }
      : {}),
  });

/**
 * One funnel, stored as two daily series: users who entered it that day
 * (`${metric}_start`) and those of them who reached the last step (`${metric}_done`).
 */
async function funnel(
  metric: string,
  events: string[],
  windowSeconds: number,
  start: string,
  end: string,
  out: DailyPoint[],
  segment?: string,
): Promise<void> {
  const params: [string, string][] = [
    ...events.map((e): [string, string] => ["e", e]),
    ["start", compact(start)],
    ["end", compact(end)],
    ["mode", "ordered"],
    ["n", "new"],
    ["cs", String(windowSeconds)],
    ["i", "1"],
  ];
  if (segment) params.push(["s", segment]);
  const res = await call<FunnelResponse>("/api/2/funnels", params);
  const perDay = res.data?.[0]?.dayFunnels;
  const days = perDay?.xValues ?? [];
  const rows = perDay?.series ?? [];
  const steps = events.length;
  // One array per day holding each step's count; or, transposed, one per step
  // holding each day's count - read either way.
  const byStep =
    rows.length === steps &&
    days.length !== steps &&
    rows.every((r) => r.length === days.length);
  const count = (dayIndex: number, step: number) =>
    Number(byStep ? rows[step]?.[dayIndex] : rows[dayIndex]?.[step]);
  days.forEach((x, i) => {
    const day = toDay(x);
    const entered = count(i, 0);
    const reached = count(i, steps - 1);
    if (!day || !Number.isFinite(entered) || !Number.isFinite(reached)) return;
    out.push({
      day,
      source: "amplitude",
      metric: `${metric}_start`,
      value: entered,
    });
    out.push({
      day,
      source: "amplitude",
      metric: `${metric}_done`,
      value: reached,
    });
  });
}

export interface AmplitudeData {
  /** The app versions the conversion figures counted (MIN_APP_VERSION and later). */
  versions: string[];
  /** Whether Amplitude returned per-day funnels (without them, only totals are known). */
  dayFunnels: boolean;
  /**
   * Subscribers still using the app, month after month (30-day periods after
   * their purchase), by plan: `active` of `outOf` who could have come back.
   * Null when Amplitude's answer could not be read.
   */
  subscriberUsage: Record<"monthly" | "annual", SubscriberUsageMonth[] | null>;
}

interface RetentionResponse {
  data?: {
    series?: {
      combined?: { count?: number; outof?: number; incomplete?: boolean }[];
    }[];
  };
}

/**
 * Usage retention of the subscribers of one plan: who bought it (Subscription
 * Purchased, plan_type) and came back to the app (any activity) in each
 * 30-day period after. Amplitude has no renewal or cancellation event: this
 * says how long subscribers keep using the app, not how long they pay.
 */
async function subscriberUsage(
  plan: "monthly" | "annual",
  range: [string, string][],
): Promise<SubscriberUsageMonth[] | null> {
  try {
    // A figure for display only: a short budget, never worth the refresh's deadline.
    const res = await call<RetentionResponse>("/api/2/retention", [
      [
        "se",
        event("Subscription Purchased", [{ key: "plan_type", values: [plan] }]),
      ],
      ["re", JSON.stringify({ event_type: "_active" })],
      ["i", "30"],
      ...range,
    ], { timeoutMs: 15_000, attempts: 1 });
    const combined = res.data?.series?.[0]?.combined;
    if (!Array.isArray(combined) || combined.length === 0) return null;
    return combined.map((cell, month) => ({
      month,
      active: Number(cell.count) || 0,
      outOf: Number(cell.outof) || 0,
      complete: cell.incomplete !== true,
    }));
  } catch (err) {
    // A shape or a limit we did not expect costs this figure, not the refresh.
    console.error(
      `[performance] amplitude retention ${plan}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export function amplitudeConfigured(): boolean {
  return Boolean(config.amplitude.apiKey && config.amplitude.secretKey);
}

export async function fetchAmplitude(
  since: string,
  epoch: string,
): Promise<{ data: AmplitudeData; daily: DailyPoint[] }> {
  const today = utcDay(new Date());
  // Daily series cover 365 days at most at Amplitude.
  const oldest = utcDay(new Date(Date.now() - 360 * 86_400_000));
  if (since < oldest) since = oldest;
  // The version list and the subscribers' retention always look at the whole
  // history, whatever the refresh window (a 45-day window would drop older
  // versions and leave the retention a month deep).
  const fullRange: [string, string][] = [
    ["start", compact(epoch > oldest ? epoch : oldest)],
    ["end", compact(today)],
  ];
  const out: DailyPoint[] = [];
  const range: [string, string][] = [
    ["start", compact(since)],
    ["end", compact(today)],
  ];

  // Active and new users per day (built-in _active / _new).
  daily(
    await call<SeriesResponse>("/api/2/users", [
      ...range,
      ["m", "active"],
      ["i", "1"],
    ]),
    "dau",
    out,
  );
  daily(
    await call<SeriesResponse>("/api/2/users", [
      ...range,
      ["m", "new"],
      ["i", "1"],
    ]),
    "new_users",
    out,
  );

  // Rolling 30-day and 7-day actives, as of each day.
  const active = JSON.stringify({ event_type: "_active" });
  daily(
    await call<SeriesResponse>("/api/2/events/segmentation", [
      ["e", active],
      ["m", "uniques"],
      ["i", "1"],
      ["rollingWindow", "30"],
      ...range,
    ]),
    "mau",
    out,
  );
  daily(
    await call<SeriesResponse>("/api/2/events/segmentation", [
      ["e", active],
      ["m", "uniques"],
      ["i", "1"],
      ["rollingWindow", "7"],
      ...range,
    ]),
    "wau",
    out,
  );

  // Conversion figures: app MIN_APP_VERSION and later only (the owners'
  // rule). The versions active users had over the whole history are asked
  // first, so a new version joins by itself, whatever its own numbers, and an
  // older 2.x build stays counted.
  const byVersion = await call<{ data?: { seriesLabels?: unknown[] } }>(
    "/api/2/events/segmentation",
    [
      [
        "e",
        JSON.stringify({
          event_type: "_active",
          group_by: [{ type: "user", value: "version" }],
        }),
      ],
      ["m", "uniques"],
      ["i", "30"],
      ...fullRange,
    ],
  );
  const versions = [
    ...new Set(
      (byVersion.data?.seriesLabels ?? [])
        .map((l) => (Array.isArray(l) ? l[l.length - 1] : l))
        .filter((v): v is string => typeof v === "string" && countedVersion(v))
        .map((v) => v.trim()),
    ),
  ].sort(compareVersions);

  if (versions.length > 0) {
    const segment = JSON.stringify([
      { prop: "version", op: "is", values: versions },
    ]);
    // New users and buyers of those versions, per day.
    daily(
      await call<SeriesResponse>("/api/2/users", [
        ...range,
        ["m", "new"],
        ["i", "1"],
        ["s", segment],
      ]),
      "new_users_v2",
      out,
    );
    daily(
      await call<SeriesResponse>("/api/2/events/segmentation", [
        ["e", event("Subscription Purchased")],
        ["m", "uniques"],
        ["i", "1"],
        ["s", segment],
        ...range,
      ]),
      "buyers_v2",
      out,
    );
    // Funnels, per day of entry. In app 2.0.0 the onboarding ends on the Home
    // screen, so "Onboarding Completed" is the arrival on Home.
    const day = 86_400;
    await funnel(
      "onboarding_v2",
      [event("First App Open"), event("Onboarding Completed")],
      day,
      since,
      today,
      out,
      segment,
    );
    await funnel(
      "purchase_7d_v2",
      [event("First App Open"), event("Subscription Purchased")],
      7 * day,
      since,
      today,
      out,
      segment,
    );
  }

  // Subscribers' usage retention, every version: it goes with the LTV, which
  // counts every payer.
  const usage = {
    monthly: await subscriberUsage("monthly", fullRange),
    annual: await subscriberUsage("annual", fullRange),
  };

  return {
    data: {
      versions,
      dayFunnels: out.some((p) => p.metric === "onboarding_v2_start"),
      subscriberUsage: usage,
    },
    daily: out,
  };
}

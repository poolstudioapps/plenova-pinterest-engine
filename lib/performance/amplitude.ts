import "server-only";
import { config } from "@/lib/config";
import { getJson, sleep, utcDay } from "@/lib/performance/http";
import type { DailyPoint } from "@/lib/performance/store";

/**
 * Amplitude (project Plenova, US region): who uses the app and how the
 * onboarding and the purchase convert. Dashboard REST API, HTTP Basic with the
 * project's API key and secret key.
 *
 * Everything is stored per day so any period can be summed later: active and
 * new users, the rolling MAU and WAU, buyers, and three funnels counted by the
 * day users entered them (Amplitude's `dayFunnels`):
 *  - onboarding, all app versions: First App Open -> Onboarding Completed, 1 day;
 *  - onboarding to Home, app 2.0.0 and later (the only versions with that
 *    step): Onboarding Step Viewed welcome -> home, 1 day;
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

async function call<T>(path: string, params: [string, string][]): Promise<T> {
  const query = params
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const data = await getJson<T>(
    "Amplitude",
    `${base()}${path}?${query}`,
    headers(),
    { timeoutMs: 60_000 },
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
  /** The app versions that have the Home step, which the onboarding-to-Home funnel is limited to. */
  homeVersions: string[];
  /** Whether Amplitude returned per-day funnels (without them, only totals are known). */
  dayFunnels: boolean;
}

export function amplitudeConfigured(): boolean {
  return Boolean(config.amplitude.apiKey && config.amplitude.secretKey);
}

export async function fetchAmplitude(
  since: string,
): Promise<{ data: AmplitudeData; daily: DailyPoint[] }> {
  const today = utcDay(new Date());
  // Daily series cover 365 days at most at Amplitude.
  const oldest = utcDay(new Date(Date.now() - 360 * 86_400_000));
  if (since < oldest) since = oldest;
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

  // Buyers per day.
  daily(
    await call<SeriesResponse>("/api/2/events/segmentation", [
      ["e", event("Subscription Purchased")],
      ["m", "uniques"],
      ["i", "1"],
      ...range,
    ]),
    "buyers",
    out,
  );

  // Funnels, per day of entry.
  const day = 86_400;
  await funnel(
    "onboarding",
    [event("First App Open"), event("Onboarding Completed")],
    day,
    since,
    today,
    out,
  );
  await funnel(
    "purchase_7d",
    [event("First App Open"), event("Subscription Purchased")],
    7 * day,
    since,
    today,
    out,
  );

  // Welcome -> Home: the Home step exists from app 2.0.0 on, and users of
  // older versions would weigh in as drop-offs. The versions that have it are
  // asked first (users who saw Home, by version), so new ones join by themselves.
  const homeStep = event("Onboarding Step Viewed", [
    { key: "step_name", values: ["home"] },
  ]);
  const byVersion = await call<{ data?: { seriesLabels?: unknown[] } }>(
    "/api/2/events/segmentation",
    [
      [
        "e",
        JSON.stringify({
          ...JSON.parse(homeStep),
          group_by: [{ type: "user", value: "version" }],
        }),
      ],
      ["m", "uniques"],
      ["i", "30"],
      ...range,
    ],
  );
  const homeVersions = [
    ...new Set(
      (byVersion.data?.seriesLabels ?? [])
        .map((l) => (Array.isArray(l) ? l[l.length - 1] : l))
        .filter(
          (v): v is string =>
            typeof v === "string" && /^\d+(\.\d+)*$/.test(v.trim()),
        )
        .map((v) => v.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (homeVersions.length > 0) {
    await funnel(
      "onboarding_home",
      [
        event("Onboarding Step Viewed", [
          { key: "step_name", values: ["welcome"] },
        ]),
        homeStep,
      ],
      day,
      since,
      today,
      out,
      JSON.stringify([{ prop: "version", op: "is", values: homeVersions }]),
    );
  }

  return {
    data: {
      homeVersions,
      dayFunnels: out.some((p) => p.metric === "onboarding_start"),
    },
    daily: out,
  };
}

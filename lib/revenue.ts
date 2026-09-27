import "server-only";
import { config } from "@/lib/config";

/**
 * The Plenova app's revenue, from RevenueCat, for the dashboard.
 *
 * Asked for "extremely secure", so:
 *  - the key is a RevenueCat API v2 secret key with read-only access to
 *    charts & metrics and nothing else (no customers, no writes): leaked, it
 *    tells the numbers below and can change nothing;
 *  - it lives in a Vercel environment variable (REVENUECAT_API_KEY, marked
 *    Sensitive), is read here only - this module cannot be imported by the
 *    browser - and is never logged or sent anywhere but api.revenuecat.com;
 *  - only these aggregate figures leave the server, and only to the
 *    addresses the allowlist marks as seeing revenue (the owner's);
 *  - there is no API route for it: the dashboard page reads it server-side.
 */

export interface RevenueOverview {
  currency: string;
  /** Monthly recurring revenue. */
  mrr: number | null;
  /** Revenue of the last 28 days. */
  revenue28: number | null;
  activeSubscriptions: number | null;
  activeTrials: number | null;
  newCustomers28: number | null;
  activeUsers28: number | null;
  /** RevenueCat's own dashboard, for the details. */
  dashboardUrl: string;
  fetchedAt: string;
}

export type RevenueResult =
  | { state: "ok"; overview: RevenueOverview }
  | { state: "not-configured" }
  | { state: "unavailable" };

const API = "https://api.revenuecat.com/v2";
/** Figures that move slowly: one call per ten minutes per server instance is plenty. */
const TTL_MS = 10 * 60 * 1000;
let cached: { at: number; overview: RevenueOverview } | null = null;

export function revenueConfigured(): boolean {
  return Boolean(config.revenuecat.apiKey && /^proj[a-z0-9]+$/i.test(config.revenuecat.projectId));
}

export async function revenueOverview(): Promise<RevenueResult> {
  if (!revenueConfigured()) return { state: "not-configured" };
  if (cached && Date.now() - cached.at < TTL_MS) return { state: "ok", overview: cached.overview };

  const project = config.revenuecat.projectId;
  try {
    const res = await fetch(`${API}/projects/${encodeURIComponent(project)}/metrics/overview`, {
      headers: { Authorization: `Bearer ${config.revenuecat.apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // The status only: the answer could echo the request, and the key must never reach a log.
      console.warn(`[revenue] RevenueCat answered ${res.status}`);
      return { state: "unavailable" };
    }
    const data = (await res.json()) as { currency?: unknown; metrics?: unknown };
    const metrics = Array.isArray(data.metrics) ? (data.metrics as { id?: unknown; value?: unknown }[]) : [];
    const pick = (id: string) => {
      const value = Number(metrics.find((m) => m.id === id)?.value);
      return Number.isFinite(value) ? value : null;
    };
    const overview: RevenueOverview = {
      currency: typeof data.currency === "string" && /^[A-Z]{3}$/.test(data.currency) ? data.currency : "EUR",
      mrr: pick("mrr"),
      revenue28: pick("revenue"),
      activeSubscriptions: pick("active_subscriptions"),
      activeTrials: pick("active_trials"),
      newCustomers28: pick("new_customers"),
      activeUsers28: pick("active_users"),
      dashboardUrl: `https://app.revenuecat.com/projects/${project.replace(/^proj/i, "")}/overview`,
      fetchedAt: new Date().toISOString(),
    };
    cached = { at: Date.now(), overview };
    return { state: "ok", overview };
  } catch {
    console.warn("[revenue] RevenueCat could not be reached");
    return { state: "unavailable" };
  }
}

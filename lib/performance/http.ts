import "server-only";

/**
 * Calls to the vendors (RevenueCat, Amplitude, AppsFlyer), shared rules:
 * a timeout, a few retries on rate limits and server errors, and errors that
 * say what failed without ever carrying a credential (keys travel in headers,
 * never in the message).
 */

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class VendorError extends Error {
  constructor(
    readonly vendor: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

async function request(
  vendor: string,
  url: string,
  init: RequestInit,
  {
    timeoutMs = 25_000,
    attempts = 3,
  }: { timeoutMs?: number; attempts?: number } = {},
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (attempt >= attempts)
        throw new VendorError(vendor, null, `${vendor} ne répond pas`);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) return res;
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt >= attempts) {
      let detail = "";
      try {
        const text = await res.text();
        // A short, sanitised hint from the vendor's own error body.
        detail = text.replace(/\s+/g, " ").slice(0, 160);
      } catch {
        detail = "";
      }
      throw new VendorError(
        vendor,
        res.status,
        `${vendor} a répondu ${res.status}${detail ? ` : ${detail}` : ""}`,
      );
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 30) * 1000
        : 3000 * attempt,
    );
  }
}

export async function getJson<T = unknown>(
  vendor: string,
  url: string,
  headers: Record<string, string>,
  options?: { timeoutMs?: number; attempts?: number },
): Promise<T> {
  const res = await request(
    vendor,
    url,
    { headers: { Accept: "application/json", ...headers } },
    options,
  );
  return (await res.json()) as T;
}

export async function getText(
  vendor: string,
  url: string,
  headers: Record<string, string>,
  options?: { timeoutMs?: number; attempts?: number },
): Promise<string> {
  const res = await request(
    vendor,
    url,
    { headers, redirect: "follow" },
    options,
  );
  return res.text();
}

/** YYYY-MM-DD of a date, in UTC - every vendor here counts days in UTC. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The UTC day `n` days before today. */
export function daysAgo(n: number): string {
  return utcDay(new Date(Date.now() - n * 86_400_000));
}

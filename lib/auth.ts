/**
 * Dashboard authentication.
 *
 * The tool triggers paid Gemini generations and, once connected, posts to real
 * social accounts. Leaving it open on a public URL means anyone who finds it
 * can burn quota or publish on your behalf, so everything is protected by
 * default.
 *
 * Vercel's own Deployment Protection would be simpler, but it blocks every
 * request including the ones that MUST stay open: TikTok reading the legal
 * pages during app review, TikTok's servers pulling carousel images, and OAuth
 * providers redirecting back. Doing it in the app lets us keep an exact
 * allowlist instead of an all-or-nothing switch.
 *
 * Uses Web Crypto rather than node:crypto so the same code runs in middleware.
 */

export const AUTH_COOKIE = "plenova_session";

/** Session lifetime. Long enough not to annoy, short enough to matter. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Paths that must stay reachable without a session.
 *
 * Every entry here is a deliberate hole, so each one carries its reason:
 *  - /legal            TikTok and Pinterest read these during app review.
 *  - OAuth callbacks   providers redirect here before a session exists.
 *  - /api/cron         guarded by CRON_SECRET instead; see the route.
 *  - /api/pull         TikTok's servers fetch slide images with no cookie;
 *                      guarded by a signature in the URL instead.
 *  - /login, /api/auth otherwise you could never sign in.
 */
const PUBLIC_PREFIXES = [
  "/api/health",
  "/api/pull",
  "/legal",
  "/login",
  "/api/auth",
  "/api/cron",
  "/api/pinterest/callback",
  "/api/tiktok/callback",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Session value is `<expiry>.<hmac(expiry)>`. The expiry is inside the signed
 * payload, so a client cannot extend its own session by editing the cookie.
 */
export async function createSession(secret: string): Promise<string> {
  const expiry = String(Date.now() + SESSION_TTL_MS);
  return `${expiry}.${await hmac(secret, expiry)}`;
}

export async function verifySession(
  secret: string,
  value: string | undefined,
): Promise<boolean> {
  if (!value) return false;
  const [expiry, signature] = value.split(".");
  if (!expiry || !signature) return false;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  return safeEqual(signature, await hmac(secret, expiry));
}

export async function checkPassword(
  secret: string,
  supplied: string,
): Promise<boolean> {
  // Compare hashes rather than raw values so the comparison is fixed-length.
  return safeEqual(await hmac(secret, "pw"), await hmac(supplied, "pw"));
}

/**
 * Dashboard authentication: an email on an allowlist, plus a code.
 *
 * The tool triggers paid Gemini generations and, once connected, posts to real
 * social accounts. It sits on a public URL, so anyone who finds it could burn
 * quota or publish on your behalf. One shared password protected that badly:
 * it cannot be revoked for one person, it says nothing about who acted, and it
 * travels by whatever channel it was first shared on.
 *
 * Now: you must be on the `allowed_emails` table in Supabase, which only the
 * owner can edit (RLS on, no policies - only the service role reaches it), and
 * you must prove you can read that mailbox. Removing a row removes the person,
 * immediately and everywhere, including any code they are already holding.
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
 *  - /tiktokXXXX.txt   TikTok fetches its own ownership-verification file
 *                      before it will pull anything at all.
 *  - /login, /api/auth otherwise you could never sign in.
 */
const PUBLIC_PREFIXES = [
  "/api/health",
  "/api/pull",
  "/legal",
  "/login",
  "/api/auth",
  "/api/cron",
  // The spy agent carries its own token, checked in each route (lib/spy-agent.ts).
  "/api/spy/agent",
  "/api/pinterest/callback",
  "/api/tiktok/callback",
];

/** TikTok's verification file sits at the root, so it cannot be a prefix. */
const TIKTOK_VERIFICATION_FILE = /^\/tiktok[A-Za-z0-9]+\.txt$/;

export function isPublicPath(pathname: string): boolean {
  if (TIKTOK_VERIFICATION_FILE.test(pathname)) return true;
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
 * The key everything here is signed with.
 *
 * `SESSION_SECRET` when it is set. Otherwise derived from
 * `TOKEN_ENCRYPTION_KEY`, which every deployment already has, through an HMAC
 * with a fixed label - so the two uses never share a key even though they
 * share a source, and nobody has to set another variable to get logins.
 */
export async function sessionSecret(): Promise<string | null> {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return explicit;

  const root = process.env.TOKEN_ENCRYPTION_KEY;
  if (!root) return null;
  return hmac(root, "plenova/session/v1");
}

/** base64url, so an address survives a cookie value intact. */
function encode(value: string): string {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    return null;
  }
}

/**
 * Session value is `<expiry>.<email>.<hmac(expiry.email)>`.
 *
 * Both the expiry and the identity are inside the signed payload, so a client
 * can neither extend its own session nor rewrite it into somebody else's by
 * editing the cookie.
 */
export async function createSession(
  secret: string,
  email: string,
): Promise<string> {
  const expiry = String(Date.now() + SESSION_TTL_MS);
  const encoded = encode(email);
  const payload = `${expiry}.${encoded}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

/** The signed-in address, or null. Null is the only failure this reports. */
export async function readSession(
  secret: string,
  value: string | undefined,
): Promise<string | null> {
  if (!value) return null;
  const [expiry, encoded, signature] = value.split(".");
  if (!expiry || !encoded || !signature) return null;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const payload = `${expiry}.${encoded}`;
  if (!safeEqual(signature, await hmac(secret, payload))) return null;

  return decode(encoded);
}

/** Lowercased and trimmed, because that is how the allowlist stores them. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Deliberately loose: the allowlist is the real check, this only rejects
 *  input that could not be an address at all. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

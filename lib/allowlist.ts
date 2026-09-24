import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

/**
 * Who may sign in, and the code that proves it.
 *
 * TWO DIFFERENT THINGS, kept apart on purpose:
 *
 *  1. `allowed_emails` is OURS. It lives in Supabase with row level security
 *     on and no policies, so the anon and authenticated roles reach nothing at
 *     all - only the service role, meaning this module and the owner in the
 *     Supabase dashboard. That table is the access list: add a row and someone
 *     can sign in, delete one and they cannot, immediately.
 *
 *  2. The six-digit code is SUPABASE'S. Its auth service generates it, mails
 *     it, expires it and rate-limits it. Writing that ourselves meant storing
 *     hashes, counting attempts and, above all, finding something to send mail
 *     with - a whole third-party account for one message a week.
 *
 * The order matters: the allowlist is checked BEFORE Supabase is asked to send
 * anything, so an address nobody authorised never receives a code at all.
 */

let service: SupabaseClient | null = null;
let publishable: SupabaseClient | null = null;

/** The service role: reads the allowlist, bypasses RLS. Never sent to a client. */
function admin(): SupabaseClient | null {
  if (service) return service;
  const { url, serviceKey } = config.supabase;
  if (!url || !serviceKey) return null;
  service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}

/**
 * The publishable role: the only one Supabase's auth endpoints accept for
 * sending and checking a one-time code. It is a public key by design - the
 * protection is the allowlist in front of it, not the secrecy of this.
 */
function otp(): SupabaseClient | null {
  if (publishable) return publishable;
  const { url, publishableKey } = config.supabase;
  if (!url || !publishableKey) return null;
  publishable = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return publishable;
}

export function isAllowlistConfigured(): boolean {
  return admin() !== null;
}

export function isOtpConfigured(): boolean {
  return otp() !== null;
}

/**
 * Whether this address may sign in.
 *
 * Errs closed: a database that will not answer means nobody gets in, which is
 * the right direction to fail for the front door of a tool that can publish.
 */
export async function isAllowed(email: string): Promise<boolean> {
  const supabase = admin();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("allowed_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[auth] the allowlist could not be read:", error.message);
    return false;
  }
  return Boolean(data);
}

export interface OtpResult {
  ok: boolean;
  /** "rate_limited" when Supabase is throttling, for a message worth reading. */
  reason?: string;
}

/** Asks Supabase to mail a code. Only ever called for an allowed address. */
export async function sendCode(email: string): Promise<OtpResult> {
  const supabase = otp();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // The allowlist already decided who may be here, so a first sign-in is
      // allowed to create the Supabase user it needs.
      shouldCreateUser: true,
      /*
       * Where the link in the mail lands. Supabase only honours this if the
       * URL is on the project's Redirect URLs list; otherwise it falls back to
       * the Site URL - which is how a link pointed at localhost and could not
       * sign anyone into production.
       */
      emailRedirectTo: `${config.app.url.replace(/\/+$/, "")}/login`,
    },
  });

  if (!error) return { ok: true };

  console.error("[auth] Supabase a refuse d'envoyer le code:", error.message);
  const rate = error.status === 429 || /rate/i.test(error.message);
  return { ok: false, reason: rate ? "rate_limited" : "upstream" };
}

/** Checks the code. Supabase owns expiry and attempt limits. */
export async function checkCode(email: string, code: string): Promise<boolean> {
  const supabase = otp();
  if (!supabase) return false;

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });

  if (error || !data.user) return false;

  /*
   * Belt and braces: Supabase says the code was right, we say the address is
   * still allowed. Between asking for a code and using it the owner may have
   * removed the row, and the front door should honour that now rather than at
   * the next sign-in.
   */
  return isAllowed(email);
}

/**
 * The address behind a sign-in link.
 *
 * Supabase's mail may carry a link rather than a code, depending on its
 * template. Clicking it verifies the address with Supabase and lands on /login
 * with an access token in the URL fragment. That token is a JWT Supabase
 * signed, and `getUser` asks Supabase itself whether it is genuine - it is
 * never trusted just for being well-formed.
 */
export async function emailFromAccessToken(token: string): Promise<string | null> {
  const supabase = otp();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return data.user.email.trim().toLowerCase();
}

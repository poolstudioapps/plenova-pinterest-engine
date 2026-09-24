import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

/**
 * Who may sign in, and the codes in flight.
 *
 * Both tables live in Supabase with row level security on and no policies, so
 * the anon and authenticated roles reach nothing at all. Only the service role
 * gets in - this module, and the owner in the Supabase dashboard. That is the
 * whole access-control story: to add or remove someone, edit `allowed_emails`
 * there, and it takes effect on the next request.
 */

/** How long a code is good for. Long enough to switch to a mail app. */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** A second request inside this window resends nothing. */
export const RESEND_AFTER_MS = 60 * 1000;

/** Guesses allowed before the code is burned. */
export const MAX_ATTEMPTS = 5;

let client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (client) return client;
  const { url, serviceKey } = config.supabase;
  if (!url || !serviceKey) return null;
  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function isAllowlistConfigured(): boolean {
  return db() !== null;
}

/**
 * Whether this address may sign in.
 *
 * Errs closed: a database that will not answer means nobody gets in, which is
 * the right direction to fail for the front door of a tool that can publish.
 */
export async function isAllowed(email: string): Promise<boolean> {
  const supabase = db();
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

export interface PendingCode {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

export async function getPendingCode(email: string): Promise<PendingCode | null> {
  const supabase = db();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("login_codes")
    .select("code_hash, expires_at, attempts, sent_at")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) return null;
  return {
    codeHash: data.code_hash as string,
    expiresAt: Date.parse(data.expires_at as string),
    attempts: (data.attempts as number) ?? 0,
    sentAt: Date.parse(data.sent_at as string),
  };
}

/** Replaces any code already in flight for this address. */
export async function storeCode(
  email: string,
  codeHash: string,
): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;

  const now = Date.now();
  const { error } = await supabase.from("login_codes").upsert({
    email,
    code_hash: codeHash,
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sent_at: new Date(now).toISOString(),
  });

  if (error) {
    console.error("[auth] the code could not be stored:", error.message);
    return false;
  }
  return true;
}

export async function countAttempt(email: string, attempts: number): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase
    .from("login_codes")
    .update({ attempts: attempts + 1 })
    .eq("email", email);
}

/** Single use: a code that worked is gone before the session is issued. */
export async function consumeCode(email: string): Promise<void> {
  const supabase = db();
  if (!supabase) return;
  await supabase.from("login_codes").delete().eq("email", email);
}

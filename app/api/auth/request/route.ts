import { NextResponse } from "next/server";
import { looksLikeEmail, normaliseEmail, sessionSecret } from "@/lib/auth";
import {
  isAllowed,
  isAllowlistConfigured,
  isOtpConfigured,
  sendCode,
} from "@/lib/allowlist";
import { reviewEmail } from "@/lib/review";

export const dynamic = "force-dynamic";

/**
 * Step one: ask for a code.
 *
 * The answer is the same whatever happens - accepted, check your mail - and
 * deliberately so. An endpoint that says "unknown address" is an endpoint that
 * tells a stranger exactly who has access, one guess at a time. The only thing
 * that distinguishes an allowed address from any other is that a mail arrives.
 *
 * The one exception is a rate limit, which is reported: it is not a hint about
 * who exists, and silently swallowing it would leave someone staring at an
 * empty inbox with no idea why.
 */
export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
  } catch {
    // Falls through to the generic answer below.
  }

  /*
   * The platform reviewers' test account signs in with a password instead
   * (lib/review.ts): the form asks for it straight away. Saying so reveals
   * only an address the reviewers are handed anyway.
   */
  if (email && email === reviewEmail()) {
    return NextResponse.json({ ok: true, method: "password" });
  }

  const secret = await sessionSecret();
  /*
   * Name what is missing. "Not configured" on its own sent the owner to guess
   * between three variables; naming the one that is absent turns a lockout
   * into a thirty-second fix. Names only - never a value.
   */
  const missing = [
    ...(secret ? [] : ["SESSION_SECRET (ou TOKEN_ENCRYPTION_KEY)"]),
    ...(isAllowlistConfigured() ? [] : ["SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"]),
    ...(isOtpConfigured() ? [] : ["SUPABASE_PUBLISHABLE_KEY"]),
  ];
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "not_configured",
          message: `La connexion n'est pas configurée : il manque ${missing.join(", ")}.`,
          missing,
        },
      },
      { status: 503 },
    );
  }

  const ok = NextResponse.json({ ok: true });

  if (!looksLikeEmail(email)) return ok;
  if (!(await isAllowed(email))) return ok;

  const result = await sendCode(email);
  if (result.ok) return ok;

  if (result.reason === "rate_limited") {
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: "Trop de demandes. Attends une minute avant de réessayer.",
        },
      },
      { status: 429 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "upstream_error",
        message: "L'e-mail n'a pas pu être envoyé. Réessaie dans un instant.",
      },
    },
    { status: 502 },
  );
}

import { NextResponse } from "next/server";
import {
  generateCode,
  hashCode,
  looksLikeEmail,
  normaliseEmail,
  sessionSecret,
} from "@/lib/auth";
import {
  RESEND_AFTER_MS,
  getPendingCode,
  isAllowed,
  isAllowlistConfigured,
  storeCode,
} from "@/lib/allowlist";
import { isMailConfigured, sendLoginCode } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * Step one: ask for a code.
 *
 * The answer is the same whatever happens - address accepted, check your
 * mail - and deliberately so. An endpoint that says "unknown address" is an
 * endpoint that tells a stranger exactly who has access, one guess at a time.
 * The only thing that distinguishes an allowed address from any other is that
 * a mail actually arrives.
 */
export async function POST(request: Request) {
  const secret = await sessionSecret();
  if (!secret || !isAllowlistConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "not_configured",
          message: "La connexion n'est pas configurée sur ce déploiement.",
        },
      },
      { status: 503 },
    );
  }

  // A missing mail provider is a real misconfiguration in production, and it
  // is reported rather than hidden: otherwise every request looks successful
  // and nobody ever receives anything.
  if (process.env.NODE_ENV === "production" && !isMailConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "not_configured",
          message: "L'envoi d'e-mails n'est pas configuré sur ce déploiement.",
        },
      },
      { status: 503 },
    );
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
  } catch {
    // Falls through to the generic answer below.
  }

  const ok = NextResponse.json({ ok: true });

  if (!looksLikeEmail(email)) return ok;
  if (!(await isAllowed(email))) return ok;

  // Already sent one a moment ago: do not send a second, and do not say so.
  const pending = await getPendingCode(email);
  if (pending && Date.now() - pending.sentAt < RESEND_AFTER_MS) return ok;

  const code = generateCode();
  const stored = await storeCode(email, await hashCode(secret, email, code));
  if (!stored) {
    return NextResponse.json(
      {
        error: {
          code: "internal",
          message: "Le code n'a pas pu être enregistré. Réessaie.",
        },
      },
      { status: 500 },
    );
  }

  const result = await sendLoginCode(email, code);
  if (!result.sent) {
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

  return ok;
}

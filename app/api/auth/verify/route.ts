import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  codesMatch,
  createSession,
  hashCode,
  looksLikeEmail,
  normaliseEmail,
  sessionSecret,
} from "@/lib/auth";
import {
  MAX_ATTEMPTS,
  consumeCode,
  countAttempt,
  getPendingCode,
  isAllowed,
} from "@/lib/allowlist";

export const dynamic = "force-dynamic";

/** One message for every failure: expired, wrong, burned, never requested. */
const REFUSED = {
  error: { code: "unauthorized", message: "Code incorrect ou expiré." },
} as const;

/**
 * Step two: hand back the code.
 *
 * The allowlist is checked again here, not just in step one. Between asking
 * for a code and using it, the owner may have removed the address - and the
 * front door should honour that immediately rather than at the next login.
 */
export async function POST(request: Request) {
  const secret = await sessionSecret();
  if (!secret) {
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

  let email = "";
  let code = "";
  try {
    const body = (await request.json()) as { email?: unknown; code?: unknown };
    email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
    code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  } catch {
    return NextResponse.json(REFUSED, { status: 401 });
  }

  if (!looksLikeEmail(email) || code.length !== 6) {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  if (!(await isAllowed(email))) {
    return NextResponse.json(REFUSED, { status: 401 });
  }

  const pending = await getPendingCode(email);
  if (!pending) return NextResponse.json(REFUSED, { status: 401 });

  if (pending.expiresAt < Date.now() || pending.attempts >= MAX_ATTEMPTS) {
    // Burned either way; stop it being guessed at leisure.
    await consumeCode(email);
    return NextResponse.json(REFUSED, { status: 401 });
  }

  const supplied = await hashCode(secret, email, code);
  if (!codesMatch(supplied, pending.codeHash)) {
    await countAttempt(email, pending.attempts);
    return NextResponse.json(REFUSED, { status: 401 });
  }

  // Single use: gone before the session exists, so a replay of the same
  // request cannot mint a second one.
  await consumeCode(email);

  const response = NextResponse.json({ ok: true, email });
  response.cookies.set(AUTH_COOKIE, await createSession(secret, email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}

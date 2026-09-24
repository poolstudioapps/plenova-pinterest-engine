import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  createSession,
  looksLikeEmail,
  normaliseEmail,
  sessionSecret,
} from "@/lib/auth";
import { checkCode } from "@/lib/allowlist";

export const dynamic = "force-dynamic";

/** One message for every failure: expired, wrong, burned, never requested. */
const REFUSED = {
  error: { code: "unauthorized", message: "Code incorrect ou expiré." },
} as const;

/**
 * Step two: hand back the code.
 *
 * Supabase owns the code - its expiry, its single use, its attempt limit. What
 * this route owns is the session: once Supabase confirms the person reads that
 * mailbox AND the address is still on the allowlist, it mints the signed
 * cookie the rest of the app runs on.
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

  if (!(await checkCode(email, code))) {
    return NextResponse.json(REFUSED, { status: 401 });
  }

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

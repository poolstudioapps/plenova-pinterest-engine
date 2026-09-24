import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSession, sessionSecret } from "@/lib/auth";
import { emailFromAccessToken, isAllowed } from "@/lib/allowlist";

export const dynamic = "force-dynamic";

const REFUSED = {
  error: {
    code: "unauthorized",
    message: "Ce lien de connexion n'est pas valide ou a expiré.",
  },
} as const;

/**
 * Sign-in by the link in the mail, rather than by the code.
 *
 * Which of the two the mail carries depends on Supabase's email template, which
 * is configured in the Supabase dashboard rather than here. Accepting both
 * means the front door works whichever the template says.
 *
 * The token arrives in the URL fragment of /login, which the server never
 * sees, so the page posts it here. It is validated by Supabase itself, then the
 * address is checked against the allowlist exactly as the code flow does -
 * a valid Supabase user who is not on the list gets nothing.
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

  let token = "";
  try {
    const body = (await request.json()) as { accessToken?: unknown };
    token = typeof body.accessToken === "string" ? body.accessToken : "";
  } catch {
    return NextResponse.json(REFUSED, { status: 401 });
  }
  // A JWT, so three dot-separated parts; anything else is not worth a round trip.
  if (token.split(".").length !== 3) {
    return NextResponse.json(REFUSED, { status: 401 });
  }

  const email = await emailFromAccessToken(token);
  if (!email || !(await isAllowed(email))) {
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

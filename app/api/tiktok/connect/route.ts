import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handle } from "@/lib/api";
import { TIKTOK_STATE_COOKIE, TIKTOK_VERIFIER_COOKIE } from "@/lib/constants";
import { randomToken } from "@/lib/crypto";
import { buildAuthorizeUrl, createPkcePair } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/**
 * Starts the TikTok OAuth flow. Both the CSRF state and the PKCE verifier are
 * held in httpOnly cookies: the verifier must never reach client JavaScript,
 * or PKCE stops protecting anything.
 */
export async function GET() {
  return handle(async () => {
    const state = randomToken(24);
    const { verifier, challenge } = createPkcePair();
    const url = buildAuthorizeUrl(state, challenge);

    const jar = await cookies();
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 600,
    };
    jar.set(TIKTOK_STATE_COOKIE, state, options);
    jar.set(TIKTOK_VERIFIER_COOKIE, verifier, options);

    return NextResponse.redirect(url);
  });
}

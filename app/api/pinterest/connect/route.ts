import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handle } from "@/lib/api";
import { randomToken } from "@/lib/crypto";
import { OAUTH_STATE_COOKIE } from "@/lib/constants";
import { buildAuthorizeUrl } from "@/lib/pinterest";

export const dynamic = "force-dynamic";

/**
 * Starts the OAuth flow. The `state` value is stored in an httpOnly cookie and
 * compared on callback, so a forged redirect cannot bind someone else's
 * Pinterest account to this deployment.
 */
export async function GET() {
  return handle(async () => {
    const state = randomToken(24);
    const url = buildAuthorizeUrl(state);

    const jar = await cookies();
    jar.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return NextResponse.redirect(url);
  });
}

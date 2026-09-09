import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import { exchangeCodeForToken } from "@/lib/pinterest";
import { OAUTH_STATE_COOKIE } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. Always redirects back to /pinterest with a readable
 * status rather than rendering raw JSON at the user.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const done = (params: Record<string, string>) => {
    const target = new URL("/pinterest", config.app.url);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    const res = NextResponse.redirect(target);
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  const denied = url.searchParams.get("error");
  if (denied) {
    return done({ status: "error", message: "Pinterest authorization was declined." });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return done({ status: "error", message: "Pinterest returned an incomplete response." });
  }

  const jar = await cookies();
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
  if (!expected || !safeEqual(expected, state)) {
    return done({
      status: "error",
      message: "OAuth state mismatch. Start the connection again from this page.",
    });
  }

  try {
    const connection = await exchangeCodeForToken(code);
    return done({
      status: "connected",
      account: connection.account?.username ?? "",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not complete the connection.";
    return done({ status: "error", message });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { TIKTOK_STATE_COOKIE, TIKTOK_VERIFIER_COOKIE } from "@/lib/constants";
import { safeEqual } from "@/lib/crypto";
import { exchangeCodeForToken } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. Always sends the operator back to /tiktok with a
 * readable status rather than rendering raw JSON at them.
 *
 * Reachable without a session - see PUBLIC_PREFIXES in lib/auth.ts - because
 * TikTok redirects the browser here before any dashboard cookie is involved.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const done = (params: Record<string, string>) => {
    const target = new URL("/tiktok", config.app.url);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    const res = NextResponse.redirect(target);
    res.cookies.delete(TIKTOK_STATE_COOKIE);
    res.cookies.delete(TIKTOK_VERIFIER_COOKIE);
    return res;
  };

  const denied = url.searchParams.get("error");
  if (denied) {
    return done({
      status: "error",
      message:
        url.searchParams.get("error_description") ??
        "L'autorisation TikTok a été refusée.",
    });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return done({ status: "error", message: "TikTok a renvoyé une réponse incomplète. Relance la connexion." });
  }

  const jar = await cookies();
  const expectedState = jar.get(TIKTOK_STATE_COOKIE)?.value;
  const verifier = jar.get(TIKTOK_VERIFIER_COOKIE)?.value;

  if (!expectedState || !safeEqual(expectedState, state)) {
    return done({
      status: "error",
      message: "Le state OAuth ne correspond pas. Relance la connexion depuis cette page.",
    });
  }
  if (!verifier) {
    return done({
      status: "error",
      message: "Le vérificateur PKCE a expiré. Relance la connexion.",
    });
  }

  try {
    const connection = await exchangeCodeForToken(code, verifier);
    return done({ status: "connected", account: connection.username });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "La connexion n'a pas pu aboutir.";
    return done({ status: "error", message });
  }
}

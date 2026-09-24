import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Signs out: the session cookie is replaced by an expired one.
 *
 * POST only. With the cookie on SameSite=Lax, another site cannot make a
 * browser send it with a cross-site POST, so nobody can log the operator out
 * from a link or an image.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

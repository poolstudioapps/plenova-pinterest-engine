import { NextResponse } from "next/server";
import { AUTH_COOKIE, checkPassword, createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "No password is set." } },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // Falls through to the failure path below.
  }

  if (!(await checkPassword(secret, password))) {
    // Deliberately vague: never confirm whether a password was close.
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Incorrect password." } },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, await createSession(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}

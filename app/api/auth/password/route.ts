import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  createSession,
  normaliseEmail,
  sessionSecret,
} from "@/lib/auth";
import { REVIEW_MARK, reviewEmail } from "@/lib/review";

export const dynamic = "force-dynamic";

/** One answer for every failure: wrong address, wrong password, no account. */
const REFUSED = {
  error: { code: "unauthorized", message: "Wrong email or password." },
} as const;

/** Compared as digests, so neither the length nor the content leaks through timing. */
const same = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );

/**
 * The review account's sign-in (lib/review.ts): the address and password set
 * in Vercel give a session like any other, which the middleware then keeps
 * read-only. A failure waits a second before answering, to slow down guessing.
 */
export async function POST(request: Request) {
  const secret = await sessionSecret();
  if (!secret) {
    return NextResponse.json(
      {
        error: {
          code: "not_configured",
          message: "Sign-in is not configured on this deployment.",
        },
      },
      { status: 503 },
    );
  }

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? normaliseEmail(body.email) : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // Falls through to the refusal below.
  }

  const review = reviewEmail();
  const expected = process.env.REVIEW_PASSWORD ?? "";
  // Both compared every time, so a right address answers no faster than a wrong one.
  const emailOk = same(email, review ?? "");
  const passwordOk = same(password, expected);
  if (!review || !emailOk || !passwordOk) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return NextResponse.json(REFUSED, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, email: review });
  response.cookies.set(AUTH_COOKIE, await createSession(secret, REVIEW_MARK + review), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}

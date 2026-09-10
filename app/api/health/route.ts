import { NextResponse } from "next/server";

/**
 * Public deployment check.
 *
 * Answers one question a push cannot: which build is actually serving. A
 * failed Vercel build leaves the previous deployment live and every page keeps
 * responding normally, so "the site is up" proves nothing about whether the
 * change shipped.
 *
 * It deliberately reads nothing - no store, no connection, no environment
 * secret - so it stays a straight answer even when the rest is misconfigured.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return NextResponse.json(
    {
      ok: true,
      commit: commit ? commit.slice(0, 7) : "local",
      builtFor: process.env.VERCEL_ENV ?? "development",
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

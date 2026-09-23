import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getStore } from "@/lib/store";

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
      // The domain the app hands to TikTok for image pulls. It has to be the
      // one verified in the developer portal, and getting it wrong fails every
      // publish with a message about URL ownership.
      baseUrl: config.app.url,
      // Which adapter is answering, and whether it survives a request. An
      // in-memory store on a serverless platform loses everything between
      // invocations: a connected account vanishes, a started carousel is not
      // found by the next request. That looks like several unrelated bugs, so
      // it is worth being able to read it from outside without signing in.
      storage: {
        persistent: getStore().persistent,
        blobConfigured: Boolean(
          process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
        ),
      },
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

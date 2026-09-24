import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { del, get, put } from "@vercel/blob";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import { blobCredentials } from "@/lib/config";
import { randomToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Proves, or disproves, that this deployment can write and read back.
 *
 * Reading working while writing does not is invisible from outside: pages
 * render normally and every save quietly fails, which reads as several
 * unrelated features breaking at once. This writes a throwaway object, reads
 * it back and removes it, using the same credentials and the same access
 * negotiation the real store uses, without touching the real document.
 *
 * Behind the password, because it reports infrastructure detail and writes.
 */
export async function GET() {
  const secret = process.env.ADMIN_PASSWORD;
  if (secret) {
    const session = (await cookies()).get(AUTH_COOKIE)?.value;
    if (!(await verifySession(secret, session))) {
      return NextResponse.json({ error: "Connecte-toi d'abord." }, { status: 401 });
    }
  }

  const path = `engine/probe-${randomToken(8)}.json`;
  const body = JSON.stringify({ probe: true });
  const steps: { step: string; ok: boolean; detail?: string }[] = [];

  let wrote: "private" | "public" | null = null;

  for (const access of ["private", "public"] as const) {
    try {
      await put(path, body, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 0,
        ...blobCredentials(),
      });
      wrote = access;
      steps.push({ step: `write:${access}`, ok: true });
      break;
    } catch (err) {
      steps.push({
        step: `write:${access}`,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (wrote) {
    try {
      const result = await get(path, {
        access: wrote,
        useCache: false,
        ...blobCredentials(),
      });
      const text = result?.stream ? await new Response(result.stream).text() : "";
      steps.push({
        step: "readback",
        ok: text === body,
        detail: text ? undefined : "rien n'est revenu",
      });
    } catch (err) {
      steps.push({
        step: "readback",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      await del(path, blobCredentials());
      steps.push({ step: "cleanup", ok: true });
    } catch {
      steps.push({ step: "cleanup", ok: false });
    }
  }

  return NextResponse.json(
    { ok: steps.every((s) => s.ok), accessMode: wrote, steps },
    { headers: { "Cache-Control": "no-store" } },
  );
}

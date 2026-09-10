import { NextResponse } from "next/server";
import { notFound } from "@/lib/errors";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ file: string }> };

/**
 * Serves TikTok's URL-ownership verification file.
 *
 * TikTok will only pull carousel images from a domain or URL prefix whose
 * ownership is proven on the app. There are two ways to prove it: a DNS TXT
 * record, or a file it hands you that must answer at the root of the domain.
 * The DNS route needs access to the zone and its value has to keep matching
 * whatever the portal currently expects; the file route needs neither.
 *
 * So the whole verification becomes one environment variable: paste the file's
 * contents into TIKTOK_VERIFICATION, redeploy, and click verify. The file name
 * is not checked against anything, because TikTok generates it and only ever
 * requests the one it generated.
 */
const VERIFICATION_FILE = /^tiktok[A-Za-z0-9]+\.txt$/;

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { file } = await params;
    const body = process.env.TIKTOK_VERIFICATION;

    if (!VERIFICATION_FILE.test(file) || !body) {
      throw notFound("Not found.");
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  });
}

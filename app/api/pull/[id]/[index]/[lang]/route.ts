import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { verifyLabel } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";
import { isContentLocale } from "@/lib/i18n";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string; index: string; lang: string }>;
};

/**
 * Serves one finished slide to TikTok, from a domain TikTok will accept.
 *
 * TikTok pulls carousel images itself, and it refuses any URL whose domain is
 * not verified in the developer portal - "please review our URL ownership
 * verification rules". The images live in Vercel Blob, whose hostname belongs
 * to Vercel and can never be verified, so handing those URLs over always
 * failed. Everything is relayed through the verified domain instead.
 *
 * It has to be reachable without a session, because TikTok's servers fetch it
 * with no cookie. So the path is signed: the id alone is not enough, and the
 * signature comes from the same key the rest of the app is keyed on.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id, index, lang } = await params;
    const url = new URL(_request.url);
    const token = url.searchParams.get("t") ?? "";

    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position > 34) {
      throw badRequest("index must be a slide position.");
    }
    if (!isContentLocale(lang)) throw badRequest("Unsupported language.");

    // Checked before anything is read, so a wrong signature cannot even
    // confirm whether a carousel exists.
    if (!verifyLabel(`${id}:${position}:${lang}`, token)) {
      throw notFound("No such slide.");
    }

    const carousel = await getStore().getCarousel(id);
    const slide = carousel?.slides[position];
    const source = slide?.composed[lang] ?? slide?.imageUrl;
    if (!source) throw notFound("No such slide.");

    if (source.startsWith("data:")) {
      const [header, payload] = source.split(",");
      const mime = header?.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
      return new NextResponse(Buffer.from(payload ?? "", "base64"), {
        headers: { "Content-Type": mime, "Cache-Control": "public, max-age=600" },
      });
    }

    const upstream = await fetch(source, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      throw notFound("The slide image could not be fetched.");
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        // TikTok may fetch each slide more than once while it processes the
        // post, so a short cache is worth having.
        "Cache-Control": "public, max-age=600",
      },
    });
  });
}

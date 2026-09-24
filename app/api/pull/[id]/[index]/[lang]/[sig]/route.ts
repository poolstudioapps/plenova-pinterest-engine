import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { verifyLabel } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";
import { isContentLocale } from "@/lib/i18n";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string; index: string; lang: string; sig: string }>;
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
 *
 * The signature is a path segment rather than a query parameter, and the URL
 * ends in .jpg, so what TikTok receives is an ordinary-looking image URL with
 * no query string at all. That is the shape it is known to accept.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id, index, lang, sig } = await params;
    const token = sig.replace(/\.jpg$/, "");

    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position > 34) {
      throw badRequest("La position de la slide est invalide.");
    }
    if (!isContentLocale(lang)) throw badRequest("Langue non prise en charge.");

    // Checked before anything is read, so a wrong signature cannot even
    // confirm whether a carousel exists.
    if (!verifyLabel(`${id}:${position}:${lang}`, token)) {
      throw notFound("Cette slide n'existe pas.");
    }

    const carousel = await getStore().getCarousel(id);
    const slide = carousel?.slides[position];
    // The composite only. The bare photograph is 2K straight out of the model,
    // which is over TikTok's picture size limit and would fail the whole post.
    const source = slide?.composed[lang];
    if (!source) throw notFound("Cette slide n'existe pas.");

    if (source.startsWith("data:")) {
      const [header, payload] = source.split(",");
      const mime = header?.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
      return new NextResponse(Buffer.from(payload ?? "", "base64"), {
        headers: { "Content-Type": mime, "Cache-Control": "public, max-age=600" },
      });
    }

    const upstream = await fetch(source, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      throw notFound("L'image de la slide n'a pas pu être chargée.");
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

import "server-only";
import { fileSlideImage, produceSlideImage } from "@/lib/carousel";
import { matchPlantSlug } from "@/lib/data/localize";
import { badRequest, notFound } from "@/lib/errors";
import { markSpyHooksUsed, recordHookUsed } from "@/lib/hooks";
import type { ContentLocale } from "@/lib/i18n";
import { defaultOverlay, type OverlayStyle } from "@/lib/overlay";
import { isPexelsConfigured } from "@/lib/pexels";
import { cleanScreenshot, readScreenshot, writeRepostCaption } from "@/lib/repost";
import { getStore } from "@/lib/store";
import type { CarouselRecord, CarouselSlide, SlideText } from "@/lib/types";

/**
 * Turns screenshots of somebody's carousel into one of ours.
 *
 * The result is an ordinary carousel record, so everything downstream already
 * works on it: the slide editor, burning the text in, publishing to several
 * accounts in their own languages. Reposting is a different way to get slides,
 * not a different kind of thing.
 */
export interface RepostInput {
  /** Hosted screenshots, in slide order. */
  frames: string[];
  languages: ContentLocale[];
  theme?: string;
  overlayStyle?: OverlayStyle;
  /**
   * Where each slide's picture comes from.
   *  - "clean":  the original photograph, its text and the app removed.
   *  - "pexels": a new photograph - a Pexels reference of the same subject,
   *              reinterpreted by Gemini, as ordinary carousels are made.
   */
  imageMode?: "clean" | "pexels";
  /** The spied carousel this rebuilds, if it came from the spy. */
  spyPostId?: string;
}

export type RepostImageMode = NonNullable<RepostInput["imageMode"]>;

function repostId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `rep_${time}${rand}`;
}

/** Records the job before any model call, so the page has something to watch. */
export async function startRepost(
  input: RepostInput,
): Promise<CarouselRecord> {
  if (input.frames.length === 0) {
    throw badRequest("Ajoute au moins une capture d'écran.");
  }
  if (input.frames.length > 35) {
    throw badRequest("Un carrousel contient 35 slides au maximum.");
  }

  const now = new Date().toISOString();
  const record: CarouselRecord = {
    id: repostId(),
    languages: input.languages,
    theme: input.theme?.trim() || "Repost",
    caption: {},
    hashtags: {},
    slides: [],
    coverIndex: 1,
    plantSlug: null,
    plantName: null,
    status: "generating",
    posts: [],
    error: null,
    progress: { done: 0, total: input.frames.length },
    createdAt: now,
    updatedAt: now,
  };

  await getStore().saveCarousel(record);
  return record;
}

/**
 * Does the work, detached from the request that asked for it.
 *
 * Every failure is written to the record rather than thrown at a caller that
 * stopped listening minutes ago.
 */
export async function runRepost(id: string, input: RepostInput): Promise<void> {
  const store = getStore();
  try {
    const slides: CarouselSlide[] = [];

    for (const [index, frame] of input.frames.entries()) {
      const source = await fetchFrame(frame);

      // Read first: if the screenshot cannot be understood there is no point
      // spending an image call on it.
      const read = await readScreenshot(source, input.languages);

      // Filed under the plant the slide shows, named from the photograph or
      // from the words on it; one nobody could name goes to the unfiled shelf.
      const plantSlug = (read.plant ? matchPlantSlug(read.plant) : null) ?? "unfiled";
      const plantName = read.plant || "Plante non identifiée";
      const theme = input.theme?.trim() || read.title[input.languages[0]!] || "Repost";

      const asset =
        input.imageMode === "pexels" && isPexelsConfigured()
          ? await produceSlideImage({
              id: `${id}_${index}`,
              imagePrompt: read.imagePrompt || read.visualSummary,
              photoQuery: read.photoQuery || read.plant || read.visualSummary,
              source: "photo",
              plantSlug,
              plantName,
              variety: null,
              varietySlug: null,
              theme,
            })
          : await fileSlideImage({
              id: `${id}_${index}`,
              image: await cleanScreenshot(source),
              imagePrompt: read.imagePrompt || read.visualSummary,
              plantSlug,
              plantName,
              variety: null,
              varietySlug: null,
              theme,
            });

      const text: Partial<Record<ContentLocale, SlideText>> = {};
      for (const language of input.languages) {
        const title = (read.title[language] ?? "").trim();
        const subtitle = (read.subtitle[language] ?? "").trim();
        const cta = (read.cta[language] ?? "").trim();
        text[language] = { title, subtitle, ...(cta ? { cta } : {}) };
      }

      const overlay = defaultOverlay(input.overlayStyle ?? "stroke");
      // Put the text back roughly where it was on the original, so the repost
      // reads like the post it came from before anyone touches it.
      if (read.placement === "top") {
        overlay.title.y = 330;
        overlay.subtitle.y = 540;
      } else if (read.placement === "bottom") {
        overlay.title.y = 900;
        overlay.subtitle.y = 1120;
      }

      slides.push({
        kind: index === 0 ? "hook" : "content",
        hasPlenovaMention: false,
        text,
        overlay,
        imagePrompt: read.imagePrompt || read.visualSummary,
        photoQuery: read.photoQuery || read.visualSummary,
        mediaId: asset.id,
        imageUrl: asset.url,
        composed: {},
      });

      const inProgress = await store.getCarousel(id);
      if (!inProgress) return; // Deleted while it ran; do not resurrect it.
      await store.saveCarousel({
        ...inProgress,
        progress: { done: index + 1, total: input.frames.length },
        updatedAt: new Date().toISOString(),
      });
    }

    const written = await writeRepostCaption(
      slides.map((s) => ({
        title: s.text[input.languages[0]!]?.title ?? "",
        subtitle: s.text[input.languages[0]!]?.subtitle ?? "",
      })),
      input.languages,
    );

    const current = await store.getCarousel(id);
    if (!current) return;

    const theme =
      input.theme?.trim() || slides[0]?.text[input.languages[0]!]?.title || "Repost";
    await store.saveCarousel({
      ...current,
      slides,
      caption: written.caption,
      hashtags: written.hashtags,
      theme,
      status: "draft",
      error: null,
      progress: null,
      updatedAt: new Date().toISOString(),
    });

    // The spied idea it came from is used now, whatever wording it ended with.
    if (input.spyPostId) await markSpyHooksUsed(input.spyPostId, id);
    /*
     * Its French cover line is ours now: no suggestion may offer it again. As
     * a carousel hook, never with the spied post's evidence - that belongs to
     * the idea read from the cover, and filing it twice showed the post twice
     * in the tier list. The bank is French, so another language is not filed.
     */
    const frenchTitle = slides[0]?.text.fr?.title?.trim();
    if (frenchTitle) {
      await recordHookUsed(frenchTitle, { source: "carousel", carouselId: id });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Le repost a échoué.";
    try {
      const carousel = await store.getCarousel(id);
      if (!carousel) return;
      await store.saveCarousel({
        ...carousel,
        status: "failed",
        error: reason,
        updatedAt: new Date().toISOString(),
      });
    } catch (writeErr) {
      console.error(
        `[repost] ${id} failed (${reason}) and could not be recorded:`,
        writeErr,
      );
    }
  }
}

/** A screenshot's bytes, whether it was stored inline or at a URL. */
async function fetchFrame(
  frame: string,
): Promise<{ data: Buffer; mimeType: string }> {
  if (frame.startsWith("data:")) {
    const match = frame.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw badRequest("Une des captures n'est pas une image lisible.");
    return {
      data: Buffer.from(match[2]!, "base64"),
      mimeType: match[1]!,
    };
  }

  const res = await fetch(frame, { cache: "no-store" });
  if (!res.ok) throw notFound("Une des captures n'a pas pu être relue.");
  return {
    data: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get("content-type") ?? "image/jpeg",
  };
}

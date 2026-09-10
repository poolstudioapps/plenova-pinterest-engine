"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  Select,
} from "@/components/ui";
import { PublishDialog } from "@/components/tiktok/PublishDialog";
import { SlideEditor } from "@/components/tiktok/SlideEditor";
import { SlidePreview } from "@/components/tiktok/SlidePreview";
import type { AccountView } from "@/components/tiktok/TikTokPanel";
import { captureSlides } from "@/lib/capture";
import {
  OVERLAY_STYLES,
  defaultOverlay,
  type OverlayStyle,
} from "@/lib/overlay";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  translator,
  type ContentLocale,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n";
import type { CarouselRecord } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

interface Props {
  uiLocale: Locale;
  initialCarousels: CarouselRecord[];
  plants: { slug: string; name: string }[];
  accounts: AccountView[];
  canGenerate: boolean;
  hasPexels: boolean;
}

const OVERLAY_STYLE_LABELS: Record<OverlayStyle, TranslationKey> = {
  stroke: "editor.styleStroke",
  pillWhite: "editor.stylePillWhite",
  pillBlack: "editor.stylePillBlack",
  none: "editor.styleNone",
};

/** Starting points, so the field is never an intimidating blank box. */
const THEME_EXAMPLES = [
  "Top 5 des pothos rares",
  "5 erreurs qui tuent ton monstera",
  "5 astuces pour ne plus oublier d'arroser",
  "Les plantes increvables pour appart sombre",
];

export function CarouselStudio({
  uiLocale,
  initialCarousels,
  plants,
  accounts,
  canGenerate,
  hasPexels,
}: Props) {
  const t = translator(uiLocale);

  const [carousels, setCarousels] = useState(initialCarousels);
  const [theme, setTheme] = useState("");
  const [plantSlug, setPlantSlug] = useState("");
  // Default to the languages the connected accounts actually publish in - the
  // point of writing several is feeding those accounts, not filling a matrix.
  const [languages, setLanguages] = useState<ContentLocale[]>(() => {
    const used = Array.from(new Set(accounts.map((a) => a.language)));
    return used.length > 0 ? used : [uiLocale as ContentLocale];
  });
  const [imageSource, setImageSource] = useState<"generate" | "photo" | "library">(
    hasPexels ? "photo" : "generate",
  );
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>("stroke");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<CarouselRecord | null>(null);
  const [editing, setEditing] = useState<{
    carousel: CarouselRecord;
    index: number;
    language: ContentLocale;
  } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<ContentLocale>(
    uiLocale as ContentLocale,
  );
  const [composing, setComposing] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Carousels this session has already tried to compose, so a failure is not
  // retried in a loop.
  const autoComposed = useRef<Set<string>>(new Set());

  function toggleLanguage(lang: ContentLocale) {
    setLanguages((current) =>
      current.includes(lang)
        ? current.filter((l) => l !== lang)
        : [...current, lang],
    );
  }

  /** Pulls the list, which is how a detached generation reports progress. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/carousels");
      if (!res.ok) return;
      const data = (await res.json()) as { carousels: CarouselRecord[] };
      setCarousels(data.carousels);
    } catch {
      // A missed poll is not worth surfacing; the next one will catch up.
    }
  }, []);

  // The server owns the generation, so the page just watches for it to finish.
  // Polling stops as soon as nothing is in flight, including after a reload
  // that landed on a carousel someone else started.
  const generating = carousels.some((c) => c.status === "generating");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!generating) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(() => void refresh(), 5000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generating, refresh]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: theme.trim(),
          languages,
          plantSlug: plantSlug || undefined,
          imageSource,
          overlayStyle,
        }),
      });
      const data = (await res.json()) as {
        carousel?: CarouselRecord;
        error?: { message?: string };
      };
      if (!res.ok || !data.carousel) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      // The response only means the work has started - it lands in the list as
      // "generating" and fills in as the server gets through it.
      setCarousels((current) => [data.carousel!, ...current]);
      setPreviewLang(data.carousel.languages[0] ?? previewLang);
      setTheme("");
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setCarousels((current) => current.filter((c) => c.id !== id));
  }

  /**
   * Burns each slide's text into its image, here in the browser, once per
   * language. The photograph is shared; only the words over it change.
   *
   * Client-side because the design relies on CSS no server-side renderer
   * implements - text stroke with paint-order, per-line pill backgrounds - and
   * this browser is the same engine the preview uses.
   */
  async function compose(carousel: CarouselRecord) {
    setComposing(carousel.id);
    setError(null);
    const total = carousel.slides.length * carousel.languages.length;
    setProgress({ done: 0, total });

    try {
      let latest = carousel;
      let done = 0;

      for (const language of carousel.languages) {
        const slides = carousel.slides.map((s, i) => ({
          // Fetched through the carousel, not the media library: the slide
          // owns its image, and the library entry may be missing.
          src: `/api/carousels/${carousel.id}/slides/${i}/raw`,
          title: s.text[language]?.title ?? "",
          subtitle: s.text[language]?.subtitle ?? "",
          cta: s.text[language]?.cta ?? "",
          // Each slide carries its own layout, so one edited slide does not
          // drag the rest of the carousel with it.
          overlay: s.overlay ?? defaultOverlay(overlayStyle),
        }));

        const captured = await captureSlides(slides, () =>
          setProgress({ done: ++done, total }),
        );

        // One request per slide to store the bytes: a whole carousel of base64
        // JPEGs in one body would exceed the platform request limit, and
        // several languages multiply that. These write no record.
        const stored: { index: number; url: string }[] = [];
        let firstFailure: string | null = null;

        for (const shot of captured) {
          const res = await fetch(`/api/carousels/${carousel.id}/render`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              index: shot.index,
              language,
              dataUrl: shot.dataUrl,
            }),
          });
          const data = (await res.json()) as {
            url?: string;
            error?: { message?: string };
          };
          if (!res.ok || !data.url) {
            // Keep going. One slide failing is no reason to abandon the six
            // that would have worked, and what did land is recorded below.
            firstFailure ??= data.error?.message ?? t("preview.requestFailed");
            continue;
          }
          stored.push({ index: shot.index, url: data.url });
        }

        // Then one write for the whole language.
        if (stored.length > 0) {
          const res = await fetch(`/api/carousels/${carousel.id}/composed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language, slides: stored }),
          });
          const data = (await res.json()) as {
            carousel?: CarouselRecord;
            error?: { message?: string };
          };
          if (!res.ok || !data.carousel) {
            setError(data.error?.message ?? t("preview.requestFailed"));
            return;
          }
          latest = data.carousel;
        }

        if (firstFailure) setError(firstFailure);
      }

      setCarousels((current) =>
        current.map((c) => (c.id === latest.id ? latest : c)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("preview.unreachable"));
    } finally {
      setComposing(null);
    }
  }

  /**
   * Burns the text in as soon as a carousel finishes, without being asked.
   *
   * The rendering needs a browser, so it cannot run alongside the server-side
   * generation - but waiting for a click meant carousels sat there as bare
   * photographs. This closes the gap whenever the page is open; the button
   * stays for anything generated while it was not.
   */
  useEffect(() => {
    if (composing) return;
    const pending = carousels.find(
      (c) =>
        c.status === "draft" &&
        c.slides.length > 0 &&
        !autoComposed.current.has(c.id) &&
        c.slides.some((s) => c.languages.some((l) => !s.composed[l])),
    );
    if (!pending) return;
    autoComposed.current.add(pending.id);
    void compose(pending);
    // compose is stable enough for this: it only reads state it is given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carousels, composing]);

  function applyPublished(updated: CarouselRecord) {
    setCarousels((current) =>
      current.map((c) => (c.id === updated.id ? updated : c)),
    );
    setPublishing(updated);
  }

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">{t("carousels.build")}</h2>
        <p className="mt-1 mb-4 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
          {t("carousels.buildHint")}
        </p>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
          <Field label={t("carousels.theme")} htmlFor="theme">
            <Input
              id="theme"
              value={theme}
              maxLength={200}
              placeholder={THEME_EXAMPLES[0]}
              onChange={(e) => setTheme(e.target.value)}
            />
          </Field>

          <Field label={t("carousels.plantOptional")} htmlFor="plant">
            <Select
              id="plant"
              value={plantSlug}
              onChange={(e) => setPlantSlug(e.target.value)}
            >
              <option value="">{t("carousels.anyPlant")}</option>
              {plants.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-medium">
            {t("carousels.languages")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CONTENT_LOCALES.map((lang) => {
              const on = languages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                    on
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]"
                      : "border-[var(--color-line)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]",
                  )}
                >
                  {CONTENT_LOCALE_LABELS[lang]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-faint)]">
            {t("carousels.languagesHint")}
          </p>
        </div>

        <div className="mt-4 grid gap-4 border-t border-[var(--color-line)] pt-4 md:grid-cols-2">
          <Field
            label={t("carousels.imageSource")}
            htmlFor="src"
            hint={hasPexels ? t("carousels.sourceHint") : t("carousels.noPexels")}
          >
            <Select
              id="src"
              value={imageSource}
              onChange={(e) =>
                setImageSource(e.target.value as "generate" | "photo" | "library")
              }
            >
              {hasPexels ? (
                <option value="photo">{t("carousels.sourcePhoto")}</option>
              ) : null}
              <option value="generate">{t("carousels.sourceGenerate")}</option>
              <option value="library">{t("carousels.sourceLibrary")}</option>
            </Select>
          </Field>

          <Field
            label={t("carousels.overlayStyle")}
            htmlFor="ov"
            hint={t("carousels.overlayHint")}
          >
            <Select
              id="ov"
              value={overlayStyle}
              onChange={(e) => setOverlayStyle(e.target.value as OverlayStyle)}
            >
              {OVERLAY_STYLES.map((style) => (
                <option key={style} value={style}>
                  {t(OVERLAY_STYLE_LABELS[style])}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {THEME_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setTheme(example)}
              className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[12px] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={generate}
            loading={busy}
            disabled={
              !canGenerate || theme.trim().length < 3 || languages.length === 0
            }
          >
            {busy ? t("carousels.starting") : t("carousels.generate")}
          </Button>
          {generating ? (
            <span className="text-[12.5px] text-[var(--color-ink-faint)]">
              {t("carousels.generatingHint")}
            </span>
          ) : null}
        </div>

        {!canGenerate ? (
          <div className="mt-4">
            <Notice tone="warn">{t("generate.needKey")}</Notice>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4">
            <Notice tone="danger" title={t("generate.failed")}>
              {error}
            </Notice>
          </div>
        ) : null}
      </Card>

      {carousels.length === 0 ? (
        <EmptyState
          title={t("carousels.empty")}
          description={t("carousels.emptyBody")}
        />
      ) : (
        <div className="space-y-4">
          {carousels.map((carousel) => {
            const inFlight = carousel.status === "generating";
            const open = expanded === carousel.id;
            const lang = carousel.languages.includes(previewLang)
              ? previewLang
              : (carousel.languages[0] ?? ("en" as ContentLocale));
            const missingComposites = carousel.slides.some((s) =>
              carousel.languages.some((l) => !s.composed[l]),
            );

            return (
              <Card key={carousel.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-4 p-4">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : carousel.id)}
                    className="flex shrink-0 -space-x-3"
                    aria-expanded={open}
                  >
                    {carousel.slides.slice(0, 4).map((slide, i) => {
                      const url = slide.composed[lang] ?? slide.imageUrl;
                      return url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${carousel.id}-${i}`}
                          src={url}
                          alt=""
                          className="size-14 rounded-[9px] border-2 border-[var(--color-surface)] object-cover"
                        />
                      ) : null;
                    })}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {carousel.slides[0]?.text[lang]?.title ?? carousel.theme}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-ink-faint)]">
                      {carousel.theme}
                      {inFlight
                        ? ` · ${t("carousels.inFlight", {
                            done: carousel.progress?.done ?? 0,
                            total: carousel.progress?.total ?? "?",
                          })}`
                        : ` · ${t("carousels.slides", { n: carousel.slides.length })}`}
                      {" · "}
                      {relativeTime(carousel.createdAt)}
                    </p>
                    {carousel.error ? (
                      <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-danger)]">
                        {carousel.error}
                      </p>
                    ) : null}
                    {missingComposites && !inFlight ? (
                      <p className="mt-1 text-[12px] text-[var(--color-warn)]">
                        {t("carousels.notComposed")}
                      </p>
                    ) : null}
                    {carousel.posts.some((p) => p.error) ? (
                      <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-danger)]">
                        {carousel.posts.find((p) => p.error)?.error}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {carousel.languages.map((l) => (
                      <Badge key={l} className="uppercase">
                        {l}
                      </Badge>
                    ))}
                    <Badge className="capitalize">{carousel.status}</Badge>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      onClick={() => void compose(carousel)}
                      loading={composing === carousel.id}
                      disabled={composing !== null || inFlight}
                    >
                      {composing === carousel.id
                        ? `${progress.done}/${progress.total}`
                        : missingComposites
                          ? t("carousels.compose")
                          : t("carousels.recompose")}
                    </Button>
                    <Button
                      onClick={() => setPublishing(carousel)}
                      disabled={accounts.length === 0 || inFlight}
                    >
                      {t("carousels.publish")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-[var(--color-danger)]"
                      onClick={() => void remove(carousel.id)}
                    >
                      {t("carousels.delete")}
                    </Button>
                  </div>
                </div>

                {open ? (
                  <div className="border-t border-[var(--color-line)] bg-[var(--color-surface-muted)] p-4">
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {carousel.languages.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setPreviewLang(l)}
                          aria-pressed={l === lang}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                            l === lang
                              ? "bg-[var(--color-accent)] text-white"
                              : "bg-[var(--color-surface)] text-[var(--color-ink-soft)]",
                          )}
                        >
                          {CONTENT_LOCALE_LABELS[l]}
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {carousel.slides.map((slide, i) => {
                        const text = slide.text[lang];
                        return (
                          <div key={`${carousel.id}-s${i}`} className="space-y-1.5">
                            {slide.imageUrl ? (
                              <SlidePreview
                                className="w-full rounded-[9px]"
                                src={`/api/carousels/${carousel.id}/slides/${i}/raw`}
                                copy={{
                                  title: text?.title ?? "",
                                  subtitle: text?.subtitle ?? "",
                                  cta: text?.cta ?? "",
                                }}
                                overlay={slide.overlay ?? defaultOverlay()}
                              />
                            ) : (
                              <div className="aspect-[4/5] w-full rounded-[9px] bg-[var(--color-line)]" />
                            )}
                            <p className="text-[12px] font-medium leading-snug">
                              {i + 1}. {text?.title ?? "—"}
                              {slide.hasPlenovaMention ? (
                                <span
                                  title={t("carousels.mentionHint")}
                                  className="ml-1 text-[var(--color-accent)]"
                                >
                                  ◆
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
                              {text?.subtitle ?? ""}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                setEditing({
                                  carousel,
                                  index: i,
                                  language: lang,
                                })
                              }
                              className="w-full rounded-[7px] border border-[var(--color-line)] py-1 text-[11.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
                            >
                              {t("editor.open")}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 border-t border-[var(--color-line)] pt-3">
                      <p className="mb-1 text-[12.5px] font-medium">
                        {t("carousels.caption")}
                      </p>
                      <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
                        {carousel.caption[lang] ?? ""}
                      </p>
                    </div>

                    {carousel.posts.length > 0 ? (
                      <div className="mt-4 border-t border-[var(--color-line)] pt-3">
                        <p className="mb-1.5 text-[12.5px] font-medium">
                          {t("carousels.posts")}
                        </p>
                        <ul className="space-y-1 text-[12px]">
                          {carousel.posts.map((post) => (
                            <li key={post.openId}>
                              <span className="font-medium">@{post.username}</span>{" "}
                              <span className="text-[var(--color-ink-faint)] uppercase">
                                {post.language}
                              </span>{" "}
                              {post.publishId ? (
                                <span className="text-[var(--color-accent)]">
                                  {post.publishId}
                                </span>
                              ) : (
                                <span className="text-[var(--color-danger)]">
                                  {post.error}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {editing ? (
        <SlideEditor
          uiLocale={uiLocale}
          carousel={editing.carousel}
          index={editing.index}
          language={editing.language}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setCarousels((current) =>
              current.map((c) => (c.id === updated.id ? updated : c)),
            );
            // Saving drops the composites the edit invalidated, so let the
            // auto-compose burn the new words in rather than leaving the old
            // ones on screen.
            autoComposed.current.delete(updated.id);
            setEditing(null);
          }}
        />
      ) : null}

      {publishing ? (
        <PublishDialog
          uiLocale={uiLocale}
          carousel={publishing}
          accounts={accounts}
          onClose={() => setPublishing(null)}
          onPublished={applyPublished}
        />
      ) : null}
    </div>
  );
}

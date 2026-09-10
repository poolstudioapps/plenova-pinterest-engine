"use client";

import { useState } from "react";
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
import { captureSlides } from "@/lib/capture";
import type { OverlayStyle } from "@/lib/overlay";
import { translator, type Locale } from "@/lib/i18n";
import type { CarouselRecord } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

interface Props {
  uiLocale: Locale;
  initialCarousels: CarouselRecord[];
  plants: { slug: string; name: string }[];
  canDirectPost: boolean;
  canDraft: boolean;
  connected: boolean;
  canGenerate: boolean;
  hasPexels: boolean;
}

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
  canDirectPost,
  canDraft,
  connected,
  canGenerate,
  hasPexels,
}: Props) {
  const t = translator(uiLocale);

  const [carousels, setCarousels] = useState(initialCarousels);
  const [theme, setTheme] = useState("");
  const [plantSlug, setPlantSlug] = useState("");
  const [postLocale, setPostLocale] = useState<Locale>(uiLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<CarouselRecord | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [composing, setComposing] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>("stroke");
  const [imageSource, setImageSource] = useState<"generate" | "photo" | "library">(
    hasPexels ? "photo" : "generate",
  );

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: theme.trim(),
          locale: postLocale,
          plantSlug: plantSlug || undefined,
          imageSource,
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
      setCarousels((current) => [data.carousel!, ...current]);
      setExpanded(data.carousel.id);
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
   * Burns each slide's text into its image, here in the browser.
   *
   * Done client-side because the design relies on CSS no server-side renderer
   * implements - text stroke with paint-order, per-line pill backgrounds - and
   * this browser is the same engine the preview uses.
   */
  async function compose(carousel: CarouselRecord) {
    setComposing(carousel.id);
    setError(null);
    setProgress({ done: 0, total: carousel.slides.length });
    try {
      const captured = await captureSlides(
        carousel.slides,
        { style: overlayStyle },
        (done, total) => setProgress({ done, total }),
      );

      let latest = carousel;
      // One request per slide: a whole carousel of base64 JPEGs in one body
      // would exceed the platform request limit.
      for (const shot of captured) {
        const res = await fetch(`/api/carousels/${carousel.id}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: shot.index, dataUrl: shot.dataUrl }),
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

      setCarousels((current) =>
        current.map((c) => (c.id === latest.id ? latest : c)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("preview.unreachable"));
    } finally {
      setComposing(null);
    }
  }

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

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,200px)_minmax(0,160px)]">
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

          <Field label={t("generate.pinLanguage")} htmlFor="loc">
            <Select
              id="loc"
              value={postLocale}
              onChange={(e) => setPostLocale(e.target.value as Locale)}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </Select>
          </Field>
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
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label={t("carousels.overlayStyle")} htmlFor="ov">
            <Select
              id="ov"
              value={overlayStyle}
              onChange={(e) => setOverlayStyle(e.target.value as OverlayStyle)}
            >
              <option value="stroke">{t("carousels.styleStroke")}</option>
              <option value="pill">{t("carousels.stylePill")}</option>
              <option value="none">{t("carousels.styleNone")}</option>
            </Select>
          </Field>
          <p className="pb-2 text-[12.5px] text-[var(--color-ink-faint)]">
            {t("carousels.overlayHint")}
          </p>
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
            disabled={!canGenerate || theme.trim().length < 3}
          >
            {busy ? t("carousels.generating") : t("carousels.generate")}
          </Button>
          {busy ? (
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
            const open = expanded === carousel.id;
            return (
              <Card key={carousel.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-4 p-4">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : carousel.id)}
                    className="flex shrink-0 -space-x-3"
                    aria-expanded={open}
                  >
                    {carousel.slideUrls.slice(0, 4).map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${carousel.id}-${i}`}
                        src={url}
                        alt=""
                        className="size-14 rounded-[9px] border-2 border-[var(--color-surface)] object-cover"
                      />
                    ))}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {carousel.title}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-ink-faint)]">
                      {carousel.theme} ·{" "}
                      {t("carousels.slides", { n: carousel.slides.length })} ·{" "}
                      {relativeTime(carousel.createdAt)}
                    </p>
                    {carousel.error ? (
                      <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-danger)]">
                        {carousel.error}
                      </p>
                    ) : carousel.slides.some((slide) => !slide.composedUrl) ? (
                      <p className="mt-1 text-[12px] text-[var(--color-warn)]">
                        {t("carousels.notComposed")}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className="uppercase">{carousel.locale}</Badge>
                    <Badge className="capitalize">{carousel.status}</Badge>
                    <Button
                      onClick={() => void compose(carousel)}
                      loading={composing === carousel.id}
                      disabled={composing !== null}
                    >
                      {composing === carousel.id
                        ? `${progress.done}/${progress.total}`
                        : carousel.slides.every((s) => s.composedUrl)
                          ? t("carousels.recompose")
                          : t("carousels.compose")}
                    </Button>
                    <Button
                      onClick={() => setPublishing(carousel)}
                      disabled={!connected || carousel.status === "published"}
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
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {carousel.slides.map((slide, i) => (
                        <div key={`${carousel.id}-s${i}`} className="space-y-1.5">
                          {slide.composedUrl ?? slide.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={slide.composedUrl ?? slide.imageUrl!}
                              alt={slide.title}
                              className="aspect-[4/5] w-full rounded-[9px] object-cover"
                            />
                          ) : (
                            <div className="aspect-[4/5] w-full rounded-[9px] bg-[var(--color-line)]" />
                          )}
                          <p className="text-[12px] font-medium leading-snug">
                            {i + 1}. {slide.title}
                          </p>
                          <p className="text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
                            {slide.subtitle}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 border-t border-[var(--color-line)] pt-3">
                      <p className="mb-1 text-[12.5px] font-medium">
                        {t("carousels.caption")}
                      </p>
                      <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
                        {carousel.description}
                      </p>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {publishing ? (
        <PublishDialog
          uiLocale={uiLocale}
          carousel={publishing}
          canDirectPost={canDirectPost}
          canDraft={canDraft}
          onClose={() => setPublishing(null)}
          onPublished={applyPublished}
        />
      ) : null}
    </div>
  );
}

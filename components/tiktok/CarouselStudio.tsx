"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  MultiPicker,
  Notice,
  Picker,
  RowMenu,
  RowMenuItem,
  SortableGrid,
} from "@/components/ui";
import { HookPicker } from "@/components/hooks/HookPicker";
import { PublishDialog } from "@/components/tiktok/PublishDialog";
import { RepostPanel } from "@/components/tiktok/RepostPanel";
import { SlideEditor } from "@/components/tiktok/SlideEditor";
import { Sprout } from "@/components/plants/Sprout";
import { SlidePreview } from "@/components/tiktok/SlidePreview";
import type { AccountView } from "@/components/tiktok/TikTokPanel";
import { captureSlides } from "@/lib/capture";
import { slideImageSrc } from "@/lib/slide-image";
import {
  OVERLAY_STYLES,
  defaultOverlay,
  type OverlayStyle,
} from "@/lib/overlay";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  DEFAULT_CONTENT_LOCALE,
  translator,
  type ContentLocale,
  type TranslationKey,
} from "@/lib/i18n";
import type { PlantIdentity } from "@/lib/data/localize";
import type { CarouselRecord } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

interface Props {
  initialCarousels: CarouselRecord[];
  /** A hook chosen on the hooks page, to start from. */
  initialTheme?: string;
  plants: PlantIdentity[];
  accounts: AccountView[];
  canGenerate: boolean;
  hasPexels: boolean;
}


/*
 * Statuses, in French.
 *
 * The badge used to print the raw stored value with a `capitalize` class, so
 * the one word describing where a carousel stood read "Published" in the
 * middle of a French interface.
 */
const STATUS_LABELS: Record<CarouselRecord["status"], TranslationKey> = {
  generating: "status.generating",
  draft: "status.draft",
  publishing: "status.publishing",
  published: "status.published",
  failed: "status.failed",
};

const OVERLAY_STYLE_LABELS: Record<OverlayStyle, TranslationKey> = {
  stroke: "editor.styleStroke",
  pillWhite: "editor.stylePillWhite",
  pillBlack: "editor.stylePillBlack",
  none: "editor.styleNone",
};

const LANGUAGE_OPTIONS = CONTENT_LOCALES.map((l) => ({
  value: l,
  label: CONTENT_LOCALE_LABELS[l],
}));

const TABS = [
  { key: "new" as const, labelKey: "carousels.build" as TranslationKey },
  { key: "repost" as const, labelKey: "repost.title" as TranslationKey },
];

export function CarouselStudio({
  initialCarousels,
  initialTheme,
  plants,
  accounts,
  canGenerate,
  hasPexels,
}: Props) {
  const t = translator();

  const [carousels, setCarousels] = useState(initialCarousels);
  const [theme, setTheme] = useState(initialTheme ?? "");
  // A hook handed over in the address is read once: reloading later must not
  // put back one that has been used since.
  useEffect(() => {
    if (initialTheme) window.history.replaceState(null, "", window.location.pathname);
  }, [initialTheme]);
  const [plantSlug, setPlantSlug] = useState("");
  // Default to the languages the connected accounts actually publish in - the
  // point of writing several is feeding those accounts, not filling a matrix.
  const [languages, setLanguages] = useState<ContentLocale[]>(() => {
    const used = Array.from(new Set(accounts.map((a) => a.language)));
    return used.length > 0 ? used : [DEFAULT_CONTENT_LOCALE];
  });
  const [imageSource, setImageSource] = useState<"generate" | "photo" | "library">(
    hasPexels ? "photo" : "generate",
  );
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>("stroke");
  /** Which way in is showing: writing a new carousel, or rebuilding one. */
  const [mode, setMode] = useState<"new" | "repost">("new");

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
    DEFAULT_CONTENT_LOCALE,
  );
  const [composing, setComposing] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  // Deleting destroys published posts too, so it asks once.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Carousels this session has already tried to compose, so a failure is not
  // retried in a loop.
  const autoComposed = useRef<Set<string>>(new Set());
  /**
   * Carousels the server confirmed deleted.
   *
   * The list is re-read while anything is generating, and that read can answer
   * a moment out of date and bring a deleted carousel straight back. The
   * server's own answer is the authority, so a confirmed deletion is kept.
   */
  const [deleted, setDeleted] = useState<string[]>([]);
  const visible = carousels.filter((c) => !deleted.includes(c.id));

  /*
   * Why the generate button is dead, computed in one place.
   *
   * Three conditions disabled it silently, and a grey button with no
   * explanation sends the operator hunting through the form for whichever one
   * it is. Order matters: a missing key outranks an empty field.
   */
  const blocked: TranslationKey | null = !canGenerate
    ? "carousels.blockedNoKey"
    : theme.trim().length < 3
      ? "carousels.blockedTheme"
      : languages.length === 0
        ? "carousels.blockedLanguages"
        : null;

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
  const generating = visible.some((c) => c.status === "generating");
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

  /** Asks TikTok again about posts it has not decided on yet. */
  async function checkStatus(id: string) {
    setChecking(id);
    setError(null);
    try {
      const res = await fetch(`/api/carousels/${id}/status`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        carousel?: CarouselRecord;
        error?: { message?: string };
      };
      if (!res.ok || !data.carousel) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      const updated = data.carousel;
      setCarousels((current) =>
        current.map((c) => (c.id === updated.id ? updated : c)),
      );
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setChecking(null);
    }
  }

  /*
   * A stable key per slide for the drag grid: its photograph, since position
   * is exactly what a reorder changes. Duplicates - the same picture used
   * twice - get a suffix so every key stays unique.
   */
  function slideKeys(carousel: CarouselRecord): string[] {
    const seen = new Map<string, number>();
    return carousel.slides.map((slide, i) => {
      const base = slide.mediaId ?? slide.imageUrl ?? `slide-${i}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return n === 0 ? base : `${base}#${n}`;
    });
  }

  const [reordering, setReordering] = useState<string | null>(null);

  /** Shown moved at once, saved behind it, put back if the save is refused. */
  async function reorder(carousel: CarouselRecord, ids: string[]) {
    const keys = slideKeys(carousel);
    const order = ids.map((id) => keys.indexOf(id));
    if (order.some((i) => i < 0)) return;

    const optimistic: CarouselRecord = {
      ...carousel,
      slides: order.map((i) => carousel.slides[i]!),
    };
    setCarousels((current) =>
      current.map((c) => (c.id === carousel.id ? optimistic : c)),
    );
    setReordering(carousel.id);
    setError(null);
    try {
      const res = await fetch(`/api/carousels/${carousel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      const data = (await res.json()) as {
        carousel?: CarouselRecord;
        error?: { message?: string };
      };
      if (!res.ok || !data.carousel) {
        setCarousels((current) =>
          current.map((c) => (c.id === carousel.id ? carousel : c)),
        );
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      const saved = data.carousel;
      setCarousels((current) => current.map((c) => (c.id === saved.id ? saved : c)));
    } catch {
      setCarousels((current) =>
        current.map((c) => (c.id === carousel.id ? carousel : c)),
      );
      setError(t("preview.unreachable"));
    } finally {
      setReordering(null);
    }
  }

  const [retrying, setRetrying] = useState<string | null>(null);

  /**
   * A failed carousel, started again from the same brief - theme, languages,
   * plant - with the image source and text style currently chosen in the
   * form. The failed record goes once the new one is on its way: it holds
   * nothing but the error.
   */
  async function retry(carousel: CarouselRecord) {
    setRetrying(carousel.id);
    setError(null);
    try {
      const res = await fetch("/api/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: carousel.theme,
          languages: carousel.languages,
          plantSlug: carousel.plantSlug ?? undefined,
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
      const started = data.carousel;
      setCarousels((current) => [started, ...current]);
      await remove(carousel.id);
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setRetrying(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/carousels/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      setDeleted((current) => [...current, id]);
      setCarousels((current) => current.filter((c) => c.id !== id));
    } catch {
      setError(t("preview.unreachable"));
    }
  }

  /**
   * Burns each slide's text into its image, here in the browser, once per
   * language. The photograph is shared; only the words over it change.
   *
   * Client-side because the design relies on CSS no server-side renderer
   * implements - text stroke with paint-order, per-line pill backgrounds - and
   * this browser is the same engine the preview uses.
   *
   * "stale" redoes only the images an edit invalidated: after changing one
   * slide in the editor, that slide is redrawn, not the whole carousel.
   */
  async function compose(carousel: CarouselRecord, scope: "all" | "stale" = "all") {
    // Only one at a time - the drawing is done by this browser - but the other
    // buttons stay alive and say so, instead of all going dead at once.
    if (composing) {
      setError(t("carousels.composeBusy"));
      return;
    }
    setComposing(carousel.id);
    setError(null);
    const todo = new Map(
      carousel.languages.map((language) => [
        language,
        carousel.slides
          .map((s, i) => (scope === "all" || !s.composed[language] ? i : -1))
          .filter((i) => i >= 0),
      ]),
    );
    // Twice: once to draw each slide, once to upload it. Reporting the
    // single count first made the counter read "0/6" and then jump to "1/12".
    const total = [...todo.values()].reduce((n, list) => n + list.length, 0);
    if (total === 0) {
      setComposing(null);
      return;
    }
    setProgress({ done: 0, total: total * 2 });

    try {
      let latest = carousel;
      let done = 0;
      // Every slide that did not make it, in any language: reported once at
      // the end, so the second language does not overwrite the first.
      const missedAll: { index: number; language: ContentLocale; reason: string }[] = [];

      for (const language of carousel.languages) {
        const indexes = todo.get(language) ?? [];
        if (indexes.length === 0) continue;
        const slides = indexes.map((i) => {
          const s = carousel.slides[i]!;
          return {
            // Fetched through the carousel, not the media library: the slide
            // owns its image, and the library entry may be missing.
            src: slideImageSrc(carousel.id, i, s),
            title: s.text[language]?.title ?? "",
            subtitle: s.text[language]?.subtitle ?? "",
            cta: s.text[language]?.cta ?? "",
            // Each slide carries its own layout, so one edited slide does not
            // drag the rest of the carousel with it.
            overlay: s.overlay ?? defaultOverlay(overlayStyle),
          };
        });

        const run = await captureSlides(slides, () =>
          setProgress({ done: ++done, total: total * 2 }),
        );
        // Positions in the carousel, not in the batch that was drawn.
        const shots = run.shots.map((shot) => ({ ...shot, index: indexes[shot.index]! }));
        const failures = run.failures.map((f) => ({ ...f, index: indexes[f.index]! }));

        // One request per slide to store the bytes: a whole carousel of base64
        // JPEGs in one body would exceed the platform request limit, and
        // several languages multiply that. These write no record.
        const stored: { index: number; url: string }[] = [];
        // Every slide that did not make it, with its position, so the message
        // names what to look at instead of a bare count.
        const missed = failures.map((f) => ({
          index: f.index,
          reason: f.reason,
        }));

        for (const shot of shots) {
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
            missed.push({
              index: shot.index,
              reason: data.error?.message ?? t("preview.requestFailed"),
            });
            continue;
          }
          stored.push({ index: shot.index, url: data.url });
          // Drawing is half the work and storing is the other half, so the
          // counter keeps moving instead of freezing on the slowest part.
          setProgress({ done: ++done, total: total * 2 });
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

        for (const m of missed) missedAll.push({ ...m, language });
      }

      if (missedAll.length > 0) {
        setError(
          t("carousels.slidesMissed", {
            slides: slideList([...new Set(missedAll.map((m) => m.index + 1))].sort((a, b) => a - b)),
            lang: [...new Set(missedAll.map((m) => m.language.toUpperCase()))].join(", "),
            reason: missedAll[0]?.reason ?? "",
          }),
        );
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
    const pending = visible.find(
      (c) =>
        c.status !== "generating" &&
        c.status !== "publishing" &&
        c.slides.length > 0 &&
        !autoComposed.current.has(c.id) &&
        staleSlides(c).length > 0,
    );
    if (!pending) return;
    autoComposed.current.add(pending.id);
    void compose(pending, "stale");
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
      {/*
        Two ways in, one card. As two stacked blocks they pushed the carousels
        themselves below the fold, and both were always open even though only
        one is ever being used.
      */}
      <Card className="overflow-hidden">
        <div role="tablist" className="flex border-b border-[var(--color-line)]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={mode === tab.key}
              aria-controls={`panel-${tab.key}`}
              tabIndex={mode === tab.key ? 0 : -1}
              onClick={() => setMode(tab.key)}
              className={cn(
                "-mb-px border-b-2 px-5 py-3.5 text-[14px] font-medium transition-colors",
                mode === tab.key
                  ? "border-[var(--color-accent)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]",
              )}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/*
          Above the panels, not inside one.

          These used to live in the "new carousel" panel, which is display:none
          while the other tab is open - and composing, deleting and publishing
          all report here from the rows BELOW the card. Deleting a carousel
          from the Reposter tab wrote its failure into a hidden div, so the
          click looked like it had simply done nothing.
        */}
        {!canGenerate || error ? (
          <div className="space-y-3 border-b border-[var(--color-line)] p-5 pb-4 md:px-6">
            {!canGenerate ? <Notice tone="warn">{t("generate.needKey")}</Notice> : null}
            {error ? (
              <Notice tone="danger">
                {error}
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="mt-2 block rounded-[8px] border border-[var(--color-line)] px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-[var(--color-danger)]"
                >
                  {t("common.dismiss")}
                </button>
              </Notice>
            ) : null}
          </div>
        ) : null}

        <div
          role="tabpanel"
          id="panel-new"
          aria-labelledby="tab-new"
          hidden={mode !== "new"}
          className="p-5 md:p-6"
        >
          <div className="grid max-w-[760px] gap-5">
            {/*
              Two questions and a button.

              Everything else here has a working default, and having all of it
              on screen at once turned a two-decision task into a configuration
              panel. The rest folds away, with its current values written on
              the summary line so nothing is hidden - only quiet.
            */}
            <Field label={t("carousels.theme")} htmlFor="theme" hint={t("carousels.themeHint")}>
              <Input
                id="theme"
                value={theme}
                maxLength={200}
                placeholder={t("carousels.themePlaceholder")}
                onChange={(e) => setTheme(e.target.value)}
              />
            </Field>
            <div className="-mt-4">
              <HookPicker plants={plants} onPick={setTheme} />
            </div>

            {/*
              Four menus, always in view.

              They used to fold behind an "Options" line with its marker
              removed, so it read as static text that happened to open a hidden
              section - nothing on screen said it could be clicked. Folding was
              there to tame three tall native selects with a paragraph each;
              one-line menus do not need taming.
            */}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("carousels.languages")} htmlFor="langs">
                <MultiPicker
                  id="langs"
                  options={LANGUAGE_OPTIONS}
                  values={languages}
                  onToggle={(v) => toggleLanguage(v as ContentLocale)}
                  placeholder={t("carousels.blockedLanguages")}
                  summary={(n) => t("carousels.languageCount", { n })}
                />
              </Field>

              <Field label={t("carousels.plantOptional")} htmlFor="plant">
                {/* The botanical name rides on a second line, which is the
                    whole reason this is not a native <select>. */}
                <Picker
                  id="plant"
                  options={[
                    { value: "", label: t("carousels.anyPlant") },
                    ...plants.map((p) => ({
                      value: p.slug,
                      label: p.primary,
                      ...(p.latin ? { detail: p.latin } : {}),
                    })),
                  ]}
                  value={plantSlug}
                  onChange={setPlantSlug}
                />
              </Field>

              <Field
                label={t("carousels.imageSource")}
                htmlFor="src"
                hint={hasPexels ? undefined : t("carousels.noPexels")}
              >
                <Picker
                  id="src"
                  options={[
                    ...(hasPexels
                      ? [{ value: "photo", label: t("carousels.sourcePhoto") }]
                      : []),
                    { value: "generate", label: t("carousels.sourceGenerate") },
                    { value: "library", label: t("carousels.sourceLibrary") },
                  ]}
                  value={imageSource}
                  onChange={(v) =>
                    setImageSource(v as "generate" | "photo" | "library")
                  }
                />
              </Field>

              <Field label={t("carousels.overlayStyle")} htmlFor="ov">
                <Picker
                  id="ov"
                  options={OVERLAY_STYLES.map((style) => ({
                    value: style,
                    label: t(OVERLAY_STYLE_LABELS[style]),
                  }))}
                  value={overlayStyle}
                  onChange={(v) => setOverlayStyle(v as OverlayStyle)}
                />
              </Field>
            </div>

            <div className="border-t border-[var(--color-line)] pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  onClick={generate}
                  loading={busy}
                  disabled={busy || blocked !== null}
                >
                  {busy ? t("carousels.starting") : t("carousels.generate")}
                </Button>
                {generating ? (
                  <span className="text-[12.5px] text-[var(--color-ink-faint)]">
                    {t("carousels.generatingHint")}
                  </span>
                ) : null}
              </div>
              {/*
                Why the button is dead, in words. A greyed-out control with no
                explanation makes the operator hunt for the missing piece.
              */}
              {blocked && !busy ? (
                <p className="mt-2 text-[12.5px] text-[var(--color-ink-faint)]">
                  {t(blocked)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div
          role="tabpanel"
          id="panel-repost"
          aria-labelledby="tab-repost"
          hidden={mode !== "repost"}
          className="p-5 md:p-6"
        >
          <RepostPanel
            languages={languages}
            onToggleLanguage={toggleLanguage}
            overlayStyle={overlayStyle}
            onOverlayStyle={setOverlayStyle}
            canGenerate={canGenerate}
            hasPexels={hasPexels}
            onStarted={(carousel) => {
              setCarousels((current) => [carousel, ...current]);
              setPreviewLang(carousel.languages[0] ?? previewLang);
              // Deliberately staying on this tab: the carousel list sits below
              // the card and is visible from both, so switching only cost the
              // operator their place and their file selection.
            }}
          />
        </div>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          title={t("carousels.empty")}
          description={t("carousels.emptyBody")}
        />
      ) : (
        <div className="space-y-4">
          {visible.map((carousel) => {
            const inFlight = carousel.status === "generating";
            const open = expanded === carousel.id;
            const lang = carousel.languages.includes(previewLang)
              ? previewLang
              : (carousel.languages[0] ?? ("en" as ContentLocale));
            const stale = staleSlides(carousel);
            const missingComposites = stale.length > 0;
            const composingThis = composing === carousel.id;

            return (
              <Card key={carousel.id} className="overflow-hidden">
                {/*
                  A grid, not a wrapping flex row.

                  The text column used to be flex-1 between the thumbnails and
                  three same-sized buttons, so on a wide screen it opened a
                  band of empty space in the middle and none of the three
                  buttons read as the thing to do. Three columns, fixed at both
                  ends, and exactly one primary action.
                */}
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : carousel.id)}
                    className="flex shrink-0 -space-x-3"
                    aria-expanded={open}
                    aria-label={t("carousels.openLabel")}
                  >
                    {/* While it is being written, a seedling grows slide by slide. */}
                    {inFlight ? (
                      <Sprout
                        progress={
                          carousel.progress && carousel.progress.total > 0
                            ? carousel.progress.done / carousel.progress.total
                            : 0
                        }
                        className="size-12 rounded-[9px] bg-[var(--color-surface-muted)] p-1.5"
                      />
                    ) : null}
                    {carousel.slides.slice(0, 3).map((slide, i) => {
                      const url = slide.composed[lang] ?? slide.imageUrl;
                      return url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${carousel.id}-${i}`}
                          src={url}
                          alt=""
                          className="size-12 rounded-[9px] border-2 border-[var(--color-surface)] object-cover"
                        />
                      ) : null;
                    })}
                    {carousel.slides.length > 3 ? (
                      <span className="grid size-12 place-items-center rounded-[9px] border-2 border-[var(--color-surface)] bg-[var(--color-surface-muted)] text-[11.5px] font-medium text-[var(--color-ink-soft)]">
                        +{carousel.slides.length - 3}
                      </span>
                    ) : null}
                  </button>

                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">
                      {carousel.slides[0]?.text[lang]?.title || carousel.theme}
                    </p>
                    {/*
                      One meta line. The languages and the status used to be a
                      separate column of badges, which is what pushed the
                      buttons to the far edge.
                    */}
                    <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-ink-faint)]">
                      {/* The theme is the title until a slide has one; never twice. */}
                      {carousel.slides[0]?.text[lang]?.title ? `${carousel.theme} · ` : ""}
                      {inFlight
                        ? t("carousels.inFlight", {
                            done: carousel.progress?.done ?? 0,
                            total: carousel.progress?.total ?? "?",
                          })
                        : t("carousels.slides", { n: carousel.slides.length })}
                      {` · ${carousel.languages.join(" ").toUpperCase()}`}
                      {` · ${t(STATUS_LABELS[carousel.status])}`}
                      {` · ${relativeTime(carousel.createdAt)}`}
                    </p>
                  </div>

                  <div className="col-span-2 flex shrink-0 items-center justify-end gap-2 sm:col-span-1">
                    {/*
                      Burning the text in is only an action while it is
                      missing. Once it is done, redoing it belongs in the menu.
                    */}
                    {missingComposites && !inFlight ? (
                      <Button
                        size="sm"
                        onClick={() => void compose(carousel, "stale")}
                        loading={composing === carousel.id}
                        disabled={composing === carousel.id}
                      >
                        {t("carousels.compose")}
                      </Button>
                    ) : null}
                    {carousel.status === "failed" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void retry(carousel)}
                        loading={retrying === carousel.id}
                        disabled={retrying !== null || !canGenerate}
                      >
                        {t("carousels.retry")}
                      </Button>
                    ) : carousel.slides.length > 0 ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setPublishing(carousel)}
                        disabled={accounts.length === 0 || inFlight || missingComposites}
                        title={
                          accounts.length === 0
                            ? t("carousels.publishNeedsAccount")
                            : composingThis
                              ? t("carousels.publishComposing")
                              : missingComposites
                                ? t("carousels.publishNeedsCompose")
                                : undefined
                        }
                      >
                        {t("carousels.publish")}
                      </Button>
                    ) : null}
                    <RowMenu label={t("carousels.more")} onClose={() => setConfirming(null)}>
                      <RowMenuItem
                        onClick={() => void compose(carousel)}
                        disabled={composing === carousel.id || inFlight}
                      >
                        {t("carousels.recompose")}
                      </RowMenuItem>
                      {carousel.posts.some((p) => p.settled === "pending") ? (
                        <RowMenuItem
                          onClick={() => void checkStatus(carousel.id)}
                          disabled={checking === carousel.id}
                        >
                          {t("carousels.checkStatus")}
                        </RowMenuItem>
                      ) : null}
                      <RowMenuItem
                        danger
                        keepOpen={confirming !== carousel.id}
                        onClick={() => {
                          if (confirming === carousel.id) void remove(carousel.id);
                          else setConfirming(carousel.id);
                        }}
                      >
                        {confirming === carousel.id
                          ? t("carousels.confirmDelete")
                          : t("carousels.delete")}
                      </RowMenuItem>
                    </RowMenu>
                  </div>

                  {/*
                    Everything that is wrong with this carousel, on its own
                    line under the title rather than stretching the row from
                    inside it.
                  */}
                  {composingThis ||
                  carousel.error ||
                  (missingComposites && !inFlight) ||
                  carousel.posts.some((p) => p.error) ? (
                    <div className="col-start-2 col-end-4 -mt-1 space-y-1">
                      {composingThis ? (
                        <p className="text-[12px] text-[var(--color-ink-soft)]">
                          {t("carousels.composingCount", {
                            done: progress.done,
                            total: progress.total,
                          })}
                        </p>
                      ) : null}
                      {/* Not while they are being redone: the counter above says so. */}
                      {missingComposites && !inFlight && !composingThis ? (
                        <p className="text-[12px] text-[var(--color-warn)]">
                          {t("carousels.notComposed", { slides: slideList(stale) })}
                        </p>
                      ) : null}
                      {carousel.error ? (
                        <p className="line-clamp-2 text-[12px] text-[var(--color-danger)]">
                          {carousel.error}
                        </p>
                      ) : null}
                      {carousel.posts.some((p) => p.error) ? (
                        <p className="line-clamp-2 text-[12px] text-[var(--color-danger)]">
                          {carousel.posts.find((p) => p.error)?.error}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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

                    {/*
                      Drag a slide to move it. Its words, layout, photograph
                      and composites all travel with it - they are stored on
                      the slide - and the cover stays the same picture.
                    */}
                    <SortableGrid
                      items={carousel.slides.map((slide, i) => ({ slide, i }))}
                      getId={({ slide, i }) => slideKeys(carousel)[i] ?? `${i}`}
                      onReorder={(ids) => void reorder(carousel, ids)}
                      disabled={inFlight || reordering === carousel.id}
                      itemLabel={(_, index, total) =>
                        t("carousels.slideLabel", { i: index + 1, n: total })
                      }
                      className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5"
                      renderItem={({ slide, i }) => {
                        const text = slide.text[lang];
                        return (
                          <div className="space-y-1.5">
                            {slide.imageUrl ? (
                              <SlidePreview
                                className="w-full rounded-[9px]"
                                src={slideImageSrc(carousel.id, i, slide)}
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
                      }}
                    />

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
                        {carousel.posts.some((p) => p.settled === "pending") ? (
                          <p className="mb-2 text-[11.5px] leading-snug text-[var(--color-ink-faint)]">
                            {t("carousels.checkStatusHint")}
                          </p>
                        ) : null}
                        <ul className="space-y-1 text-[12px]">
                          {carousel.posts.map((post) => (
                            <li key={post.openId}>
                              <span className="font-medium">
                                {post.username
                                  ? `@${post.username}`
                                  : post.openId.slice(-6)}
                              </span>{" "}
                              <span className="text-[var(--color-ink-faint)] uppercase">
                                {post.language}
                              </span>{" "}
                              {/*
                                The outcome decides, never the publish id: an
                                id means TikTok accepted the request, not that
                                the post exists. Reading the id first is what
                                labelled a rejected post "published".
                              */}
                              {post.settled === "failed" ||
                              (!post.publishId && post.error) ? (
                                <span className="text-[var(--color-danger)]">
                                  ✕ {post.error ?? t("carousels.postFailed")}
                                </span>
                              ) : post.settled === "pending" ? (
                                <span className="text-[var(--color-ink-soft)]">
                                  ⋯ {t("carousels.postPending")}
                                </span>
                              ) : post.publishId ? (
                                <span className="text-[var(--color-accent)]">
                                  ✓{" "}
                                  {post.postMode === "MEDIA_UPLOAD"
                                    ? t("carousels.postDraft")
                                    : t("carousels.postPublished")}
                                </span>
                              ) : (
                                <span className="text-[var(--color-danger)]">
                                  ✕ {post.error ?? t("carousels.postFailed")}
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
          carousel={editing.carousel}
          index={editing.index}
          language={editing.language}
          plants={plants}
          hasPexels={hasPexels}
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
          carousel={publishing}
          accounts={accounts}
          onClose={() => setPublishing(null)}
          onPublished={applyPublished}
        />
      ) : null}
    </div>
  );
}

/**
 * The slides, by number, whose image is missing in at least one language -
 * never made, or dropped because an edit changed its words, layout or photo.
 */
function staleSlides(carousel: CarouselRecord): number[] {
  return carousel.slides
    .map((s, i) => (carousel.languages.some((l) => !s.composed[l]) ? i + 1 : 0))
    .filter((n) => n > 0);
}

/** "la slide 4", "les slides 4 et 5", "les slides 2, 4 et 5". */
function slideList(numbers: number[]): string {
  if (numbers.length === 1) return `la slide ${numbers[0]}`;
  return `les slides ${numbers.slice(0, -1).join(", ")} et ${numbers[numbers.length - 1]}`;
}

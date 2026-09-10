"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from "@/components/ui";
import { PublishDialog } from "@/components/tiktok/PublishDialog";
import { translator, type Locale } from "@/lib/i18n";
import type { CarouselRecord, MediaAsset } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

interface Props {
  uiLocale: Locale;
  initialCarousels: CarouselRecord[];
  plants: { slug: string; name: string }[];
  canDirectPost: boolean;
  canDraft: boolean;
  connected: boolean;
}

export function CarouselStudio({
  uiLocale,
  initialCarousels,
  plants,
  canDirectPost,
  canDraft,
  connected,
}: Props) {
  const t = translator(uiLocale);

  const [carousels, setCarousels] = useState(initialCarousels);
  const [plantSlug, setPlantSlug] = useState(plants[0]?.slug ?? "");
  const [library, setLibrary] = useState<MediaAsset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<CarouselRecord | null>(null);

  // The library is scoped to the selected plant: that is how you actually look
  // for slides, and it keeps the grid short.
  useEffect(() => {
    let cancelled = false;
    setSelected([]);
    void (async () => {
      try {
        const res = await fetch(
          `/api/media?plantSlug=${encodeURIComponent(plantSlug)}&limit=100`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { media: MediaAsset[] };
        if (!cancelled) setLibrary(data.media);
      } catch {
        // The picker is not essential; the page still lists existing carousels.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plantSlug]);

  const selectedAssets = useMemo(
    () =>
      selected
        .map((id) => library.find((a) => a.id === id))
        .filter((a): a is MediaAsset => Boolean(a)),
    [selected, library],
  );

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : // TikTok caps a photo carousel at 35 slides.
          current.length >= 35
          ? current
          : [...current, id],
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideIds: selected,
          title: title.trim(),
          description: description.trim(),
          locale: uiLocale,
          coverIndex: 1,
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
      setSelected([]);
      setTitle("");
      setDescription("");
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

  function applyPublished(updated: CarouselRecord) {
    setCarousels((current) =>
      current.map((c) => (c.id === updated.id ? updated : c)),
    );
    setPublishing(updated);
  }

  const canCreate = selected.length > 0 && title.trim().length > 0;

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t("carousels.build")}</h2>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Field label={t("carousels.pickPlant")} htmlFor="plant">
              <Select
                id="plant"
                value={plantSlug}
                onChange={(e) => setPlantSlug(e.target.value)}
              >
                {plants.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={t("carousels.captionTitle")}
              htmlFor="title"
              hint={`${title.length}/90 · ${t("carousels.captionTitleHint")}`}
            >
              <Input
                id="title"
                maxLength={90}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field label={t("carousels.captionDesc")} htmlFor="desc">
              <Textarea
                id="desc"
                rows={4}
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <Button
              variant="primary"
              className="w-full"
              onClick={create}
              loading={busy}
              disabled={!canCreate}
            >
              {t("carousels.create")}
            </Button>

            {error ? <Notice tone="danger">{error}</Notice> : null}
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium">
              {t("carousels.pickSlides")}{" "}
              <span className="font-normal text-[var(--color-ink-faint)]">
                — {t("carousels.selected", { n: selected.length })}
              </span>
            </p>
            <p className="mb-3 text-[12.5px] text-[var(--color-ink-faint)]">
              {t("carousels.pickSlidesHint")}
            </p>

            {library.length === 0 ? (
              <Notice tone="info">{t("carousels.noImages")}</Notice>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
                {library.map((asset) => {
                  const index = selected.indexOf(asset.id);
                  const isSelected = index !== -1;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => toggle(asset.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "relative overflow-hidden rounded-[9px] border-2 transition-colors",
                        isSelected
                          ? "border-[var(--color-accent)]"
                          : "border-transparent hover:border-[var(--color-line-strong)]",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt={asset.variety ?? asset.plantName}
                        className="aspect-pin w-full object-cover"
                      />
                      {isSelected ? (
                        <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-[var(--color-accent)] text-[11px] font-semibold text-white">
                          {index + 1}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedAssets.length > 0 ? (
              <p className="mt-3 text-[12px] text-[var(--color-ink-faint)]">
                {t("carousels.slides", { n: selectedAssets.length })}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      {carousels.length === 0 ? (
        <EmptyState
          title={t("carousels.empty")}
          description={t("carousels.emptyBody")}
        />
      ) : (
        <div className="space-y-3">
          {carousels.map((carousel) => (
            <Card key={carousel.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex shrink-0 -space-x-3">
                {carousel.slideUrls.slice(0, 4).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${carousel.id}-${i}`}
                    src={url}
                    alt=""
                    className="size-14 rounded-[9px] border-2 border-[var(--color-surface)] object-cover"
                  />
                ))}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{carousel.title}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-ink-faint)]">
                  {carousel.plantName} ·{" "}
                  {t("carousels.slides", { n: carousel.slideUrls.length })} ·{" "}
                  {relativeTime(carousel.createdAt)}
                </p>
                {carousel.error ? (
                  <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-danger)]">
                    {carousel.error}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge className="capitalize">{carousel.status}</Badge>
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
            </Card>
          ))}
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

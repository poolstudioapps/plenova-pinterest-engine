"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, FileDropZone, Notice, PlantName, Spinner } from "@/components/ui";
import { shrinkImage } from "@/lib/client-image";
import type { PlantIdentity } from "@/lib/data/localize";
import { translator, type TranslationKey } from "@/lib/i18n";
import { identityForAsset, normaliseSearch, shelfOf } from "@/lib/media";
import type { MediaAsset } from "@/lib/types";
import { cn } from "@/lib/utils";
import * as Icon from "./icons";

export type PickerTab = "templates" | "plant" | "hook" | "cta" | "all";
type LibraryTab = Exclude<PickerTab, "templates">;

const TABS: { id: LibraryTab; label: TranslationKey }[] = [
  { id: "plant", label: "editor.pickerPlant" },
  { id: "hook", label: "media.shelfHook" },
  { id: "cta", label: "media.shelfCta" },
  { id: "all", label: "editor.pickerAll" },
];

interface Props {
  /** The carousel's plant, whose shelf opens first. */
  plantSlug: string | null;
  plantLabel: string | null;
  /** The picture on the slide now, marked in the grid. */
  currentId: string | null;
  plants: PlantIdentity[];
  initialTab: PickerTab;
  onPick: (asset: MediaAsset) => void;
  onClose: () => void;
  /** Defaults to "choose a photo". */
  title?: string;
  /**
   * Saved slides, offered as a first tab when a slide is being ADDED - a
   * slide ready with its words is exactly what adding a CTA wants.
   */
  templates?: { count: number; render: (search: string) => ReactNode };
}

/**
 * The library, opened from a slide: pick the picture it should show.
 *
 * Shelves first, because that is how a replacement is looked for - "another
 * Monstera", "a cover shot", "one of my CTA images" - with the whole library
 * and a search behind them. Every species tile carries both names, common and
 * botanical, so a picture is never swapped for the wrong plant. Pictures can
 * be brought in right here, dropped or chosen; one picture brought in for
 * this slide goes straight onto it.
 */
export function PhotoPicker({
  plantSlug,
  plantLabel,
  currentId,
  plants,
  initialTab,
  onPick,
  onClose,
  title,
  templates,
}: Props) {
  const t = translator();
  const catalog = useMemo(() => new Map(plants.map((p) => [p.slug, p])), [plants]);
  const known = useMemo(() => new Set(plants.map((p) => p.slug)), [plants]);

  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PickerTab>(
    !plantSlug && initialTab === "plant"
      ? "all"
      : !templates && initialTab === "templates"
        ? "all"
        : initialTab,
  );
  const heading = title ?? t("editor.pickerTitle");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/media?limit=500")
      .then(async (res) => {
        const data = (await res.json()) as {
          media?: MediaAsset[];
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!res.ok || !data.media) {
          setError(data.error?.message ?? t("preview.requestFailed"));
          setAssets([]);
          return;
        }
        setAssets(data.media);
      })
      .catch(() => {
        if (cancelled) return;
        setError(t("preview.unreachable"));
        setAssets([]);
      });
    return () => {
      cancelled = true;
    };
    // Loaded once per opening; `t` is a module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shelves = useMemo(() => {
    const q = normaliseSearch(search);
    const matches = (a: MediaAsset) =>
      !q ||
      identityForAsset(a, catalog).search.includes(q) ||
      normaliseSearch(a.prompt).includes(q) ||
      a.tags.some((tag) => normaliseSearch(tag).includes(q));
    const by: Record<LibraryTab, MediaAsset[]> = { plant: [], hook: [], cta: [], all: [] };
    for (const a of assets ?? []) {
      if (!matches(a)) continue;
      by.all.push(a);
      const shelf = shelfOf(a, known);
      if (shelf === "cta") by.cta.push(a);
      else if (shelf === "hook") by.hook.push(a);
      if (plantSlug && a.plantSlug === plantSlug) by.plant.push(a);
    }
    return by;
  }, [assets, search, catalog, known, plantSlug]);

  const tabs = TABS.filter((tb) => tb.id !== "plant" || plantSlug);
  const onTemplates = tab === "templates";
  const list = onTemplates ? [] : shelves[tab];

  // Where a picture brought in lands: the shelf on screen, or the carousel's
  // own plant from the whole-library view.
  const target: { role: "cta" | "hook" } | { plantSlug: string } =
    tab === "cta"
      ? { role: "cta" }
      : tab === "hook"
        ? { role: "hook" }
        : plantSlug
          ? { plantSlug }
          : { role: "hook" };
  const targetLabel =
    "plantSlug" in target
      ? (plantLabel ?? target.plantSlug)
      : t(target.role === "cta" ? "media.shelfCta" : "media.shelfHook");

  async function upload(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setError(null);
    setUploading({ done: 0, total: images.length });
    const added: MediaAsset[] = [];
    try {
      for (const [i, file] of images.entries()) {
        const image = await shrinkImage(file);
        const res = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...image,
            ...target,
            name: file.name.replace(/\.[^.]+$/, ""),
          }),
        });
        const data = (await res.json()) as {
          asset?: MediaAsset;
          error?: { message?: string };
        };
        if (!res.ok || !data.asset) {
          setError(data.error?.message ?? t("preview.requestFailed"));
          break;
        }
        added.push(data.asset);
        setUploading({ done: i + 1, total: images.length });
      }
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setUploading(null);
      if (input.current) input.current.value = "";
      if (added.length > 0) {
        setAssets((current) => [...added, ...(current ?? [])]);
        const only = added[0];
        if (added.length === 1 && images.length === 1 && only) onPick(only);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/55 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-raised)]"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-3.5">
          <h3 className="text-[15px] font-semibold">{heading}</h3>
          <div
            role="tablist"
            aria-label={heading}
            className="flex flex-wrap gap-1 rounded-full bg-[var(--color-surface-muted)] p-1"
          >
            {templates ? (
              <button
                type="button"
                role="tab"
                aria-selected={onTemplates}
                onClick={() => setTab("templates")}
                className={cn(
                  "rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors",
                  onTemplates
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                )}
              >
                {t("editor.pickerTemplates")}
                <span className="ml-1.5 text-[11px] text-[var(--color-ink-faint)]">
                  {templates.count}
                </span>
              </button>
            ) : null}
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={tab === tb.id}
                onClick={() => setTab(tb.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors",
                  tab === tb.id
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)]"
                    : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
                )}
              >
                {tb.id === "plant" && plantLabel ? plantLabel : t(tb.label)}
                <span className="ml-1.5 text-[11px] text-[var(--color-ink-faint)]">
                  {shelves[tb.id].length}
                </span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <label className="relative flex items-center">
              <span className="pointer-events-none absolute left-2.5 text-[var(--color-ink-faint)]">
                <Icon.Search />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("editor.pickerSearch")}
                aria-label={t("editor.pickerSearch")}
                className="w-[200px] rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] py-1.5 pr-3 pl-8 text-[13px] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => void upload(Array.from(e.target.files ?? []))}
            />
            <Button
              size="sm"
              onClick={() => input.current?.click()}
              loading={uploading !== null}
              className={onTemplates ? "hidden" : undefined}
            >
              {uploading ? null : <Icon.Upload />}
              {uploading
                ? t("media.uploading", { done: uploading.done, total: uploading.total })
                : t("editor.pickerUpload")}
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("editor.close")}
              className="grid size-8 place-items-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
            >
              <Icon.Close />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? (
            <div className="mb-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}
          {onTemplates && templates ? (
            templates.render(search)
          ) : (
          <FileDropZone
            onFiles={(files) => void upload(files)}
            label={t("editor.pickerDrop", { shelf: targetLabel })}
            disabled={uploading !== null}
          >
            {assets === null ? (
              <div className="grid place-items-center py-20 text-[var(--color-ink-faint)]">
                <Spinner />
              </div>
            ) : list.length === 0 ? (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] px-6 py-14 text-center transition-colors hover:border-[var(--color-accent)]"
              >
                <span className="text-[14px] font-medium">
                  {search ? t("media.noMatch") : t("editor.pickerEmpty")}
                </span>
                <span className="text-[12.5px] text-[var(--color-ink-faint)]">
                  {t("editor.pickerEmptyBody")}
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {list.map((asset) => {
                  const shelf = shelfOf(asset, known);
                  const identity = identityForAsset(asset, catalog);
                  const current = asset.id === currentId;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onPick(asset)}
                      aria-pressed={current}
                      className={cn(
                        "overflow-hidden rounded-[12px] border bg-[var(--color-surface)] text-left transition-[border-color,box-shadow]",
                        current
                          ? "border-[var(--color-accent)] shadow-[0_0_0_2px_var(--color-accent)]"
                          : "border-[var(--color-line)] hover:border-[var(--color-accent)]",
                      )}
                    >
                      <span className="relative block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt={identity.label}
                          loading="lazy"
                          draggable={false}
                          className="aspect-[4/5] w-full object-cover"
                        />
                        {current ? (
                          <span className="absolute top-1.5 right-1.5 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10.5px] font-semibold text-white">
                            {t("editor.pickerCurrent")}
                          </span>
                        ) : null}
                        {asset.aspectRatio && asset.aspectRatio !== "4:5" ? (
                          <span
                            title={t("editor.pickerRatio")}
                            className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-1.5 py-px text-[10px] font-medium text-white"
                          >
                            {asset.aspectRatio}
                          </span>
                        ) : null}
                      </span>
                      <span className="block space-y-0.5 p-2">
                        {shelf === "species" ? (
                          <PlantName identity={identity} size="sm" />
                        ) : (
                          <span className="block truncate text-[12px] font-medium">
                            {t(shelf === "cta" ? "media.shelfCta" : "media.shelfHook")}
                          </span>
                        )}
                        <span className="block text-[11px] text-[var(--color-ink-faint)]">
                          {t("media.used", { n: asset.usedCount })}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </FileDropZone>
          )}
        </div>

        <footer className="border-t border-[var(--color-line)] px-5 py-2.5 text-[12px] text-[var(--color-ink-faint)]">
          {onTemplates
            ? t("editor.pickerTemplatesHint")
            : t("editor.pickerUploadTo", { shelf: targetLabel })}
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Notice,
  Picker,
  PlantName,
} from "@/components/ui";
import { shrinkImage } from "@/lib/client-image";
import {
  groupByPlant,
  identityForAsset,
  normaliseSearch,
  shelfOf,
} from "@/lib/media";
import type { PlantIdentity } from "@/lib/data/localize";
import { translator, type TranslationKey } from "@/lib/i18n";
import type { MediaAsset, MediaRole } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

interface Props {
  initialAssets: MediaAsset[];
  plants: PlantIdentity[];
  styles: { slug: string; label: string }[];
}

/** The two shelves the operator fills by hand, in the order they appear. */
const SHELVES: { role: MediaRole; title: TranslationKey; hint: TranslationKey }[] = [
  { role: "cta", title: "media.shelfCta", hint: "media.shelfCtaHint" },
  { role: "hook", title: "media.shelfHook", hint: "media.shelfHookHint" },
];

/**
 * The library, in three kinds of shelf.
 *
 *  - CTA Plenova: the operator's own prepared images, for the slide that
 *    carries the Plenova mention.
 *  - Hook / Outro: opening and closing shots. Every image filed under a
 *    species the catalog does not know lands here on its own - a plant nobody
 *    can name is exactly the generic green shot a cover wants.
 *  - Then one shelf per species, browsed plant-first, because that is how you
 *    look for a reusable image: "what do I already have for a Monstera?".
 */
export function MediaClient({ initialAssets, plants, styles }: Props) {
  const t = translator();
  const styleLabels = useMemo(
    () => new Map(styles.map((s) => [s.slug, s.label])),
    [styles],
  );
  /*
   * The catalog, indexed. Built from a prop rather than imported: the plant
   * catalog carries every care field and every visual description, and none of
   * that belongs in a browser bundle.
   */
  const catalog = useMemo(
    () => new Map(plants.map((p) => [p.slug, p])),
    [plants],
  );
  const known = useMemo(() => new Set(plants.map((p) => p.slug)), [plants]);

  const [assets, setAssets] = useState(initialAssets);
  const [plantSlug, setPlantSlug] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = normaliseSearch(search);
    return assets.filter((a) => {
      if (plantSlug && a.plantSlug !== plantSlug) return false;
      if (!q) return true;
      // Both names are on screen, so both have to be searchable - typing
      // "Epipremnum" must find the pothos, and so must "lierre du diable".
      return (
        identityForAsset(a, catalog).search.includes(q) ||
        normaliseSearch(a.prompt).includes(q) ||
        a.tags.some((tag) => normaliseSearch(tag).includes(q))
      );
    });
  }, [assets, plantSlug, search, catalog]);

  const byShelf = useMemo(() => {
    const cta: MediaAsset[] = [];
    const hook: MediaAsset[] = [];
    const species: MediaAsset[] = [];
    for (const a of filtered) {
      const shelf = shelfOf(a, known);
      if (shelf === "cta") cta.push(a);
      else if (shelf === "hook") hook.push(a);
      else species.push(a);
    }
    return { cta, hook, species };
  }, [filtered, known]);

  const groups = useMemo(() => groupByPlant(byShelf.species), [byShelf.species]);

  async function remove(id: string) {
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setAssets((current) => current.filter((a) => a.id !== id));
  }

  // Filtering to one species hides the hand-filled shelves: they are not that
  // species, and showing them would read as a filter that did not work.
  const showShelves = !plantSlug;

  return (
    <div className="space-y-8">
      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        {/* `p.primary` + `p.latin`, not the flat `p.label`: the picker draws a
            second line, so the botanical name no longer has to be folded into
            the first one to fit an <option>. */}
        <Picker
          options={[
            { value: "", label: t("media.allPlants") },
            ...plants.map((p) => ({
              value: p.slug,
              label: p.primary,
              ...(p.latin ? { detail: p.latin } : {}),
            })),
          ]}
          value={plantSlug}
          onChange={setPlantSlug}
        />
        <Input
          type="search"
          placeholder={t("media.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {showShelves
        ? SHELVES.map((shelf) => (
            <Shelf
              key={shelf.role}
              role={shelf.role}
              title={t(shelf.title)}
              hint={t(shelf.hint)}
              assets={shelf.role === "cta" ? byShelf.cta : byShelf.hook}
              onAdded={(added) => setAssets((current) => [...added, ...current])}
              onRemove={(id) => void remove(id)}
            />
          ))
        : null}

      <section className="space-y-6">
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-6">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
            {t("media.shelfSpecies")}
          </h2>
          <p className="text-[13px] text-[var(--color-ink-faint)]">
            {t("media.count", {
              count: byShelf.species.length,
              plants: groups.length,
            })}
          </p>
        </div>

        {assets.length === 0 ? (
          <EmptyState title={t("media.empty")} description={t("media.emptyBody")} />
        ) : groups.length === 0 ? (
          <EmptyState
            title={t("media.noMatch")}
            description={t("library.noMatchBody")}
          />
        ) : (
          groups.map((group) => (
            <section key={group.plantSlug} className="space-y-3">
              {/*
                The heading is the highest-value line on this page: it is what
                says which species the row below actually is. Derived from the
                slug, never from the name stored on the asset - that one was
                captured in the pin's own language, so a Spanish pin filed its
                image under an English name.
              */}
              <div className="flex items-baseline gap-2">
                <PlantName
                  identity={identityForAsset(
                    {
                      plantSlug: group.plantSlug,
                      plantName: group.fallbackName,
                      variety: null,
                    },
                    catalog,
                  )}
                />
                <span className="shrink-0 text-[12.5px] text-[var(--color-ink-faint)]">
                  {group.assets.length}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {group.assets.map((asset) => (
                  <Card key={asset.id} className="overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt={identityForAsset(asset, catalog).label}
                      className="aspect-pin w-full object-cover"
                    />
                    <div className="space-y-1.5 p-2.5">
                      {asset.variety ? (
                        <p className="truncate text-[11.5px] text-[var(--color-ink-soft)]">
                          {`'${asset.variety}'`}
                        </p>
                      ) : null}
                      <p className="truncate text-[11.5px] text-[var(--color-ink-faint)]">
                        {styleLabels.get(asset.visualStyle) ?? asset.visualStyle}
                      </p>
                      <span className="block text-[11px] text-[var(--color-ink-faint)]">
                        {t("media.used", { n: asset.usedCount })} ·{" "}
                        {relativeTime(asset.createdAt)}
                      </span>
                      <Button
                        variant="ghost"
                        className="w-full px-1 py-1 text-[11.5px] text-[var(--color-danger)]"
                        onClick={() => void remove(asset.id)}
                      >
                        {t("media.delete")}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))
        )}
      </section>
    </div>
  );
}

/**
 * One hand-filled shelf: its images, and a way to add more.
 *
 * Shown even when empty, because an empty CTA shelf is precisely where the
 * operator needs the upload button - hiding the shelf until it has something
 * in it would hide the only way to put something in it.
 */
function Shelf({
  role,
  title,
  hint,
  assets,
  onAdded,
  onRemove,
}: {
  role: MediaRole;
  title: string;
  hint: string;
  assets: MediaAsset[];
  onAdded: (assets: MediaAsset[]) => void;
  onRemove: (id: string) => void;
}) {
  const t = translator();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setBusy({ done: 0, total: files.length });
    const added: MediaAsset[] = [];
    try {
      // One request per image: several in one body would run past the
      // platform's request limit, and a slow one should not hold up the rest.
      for (const [i, file] of files.entries()) {
        const image = await shrinkImage(file);
        const res = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...image,
            role,
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
        setBusy({ done: i + 1, total: files.length });
      }
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      if (added.length > 0) onAdded(added);
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
            {title}{" "}
            <span className="text-[13px] font-normal text-[var(--color-ink-faint)]">
              {assets.length}
            </span>
          </h2>
          <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
            {hint}
          </p>
        </div>
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
          loading={busy !== null}
        >
          {busy
            ? t("media.uploading", { done: busy.done, total: busy.total })
            : t("media.upload")}
        </Button>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {assets.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] px-6 py-10 text-[13.5px] text-[var(--color-ink-faint)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
        >
          {t("media.shelfEmpty")}
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.url}
                alt={asset.prompt || title}
                className="aspect-[4/5] w-full object-cover"
              />
              <div className="flex items-center justify-between gap-1 p-2">
                <span className="truncate text-[11px] text-[var(--color-ink-faint)]">
                  {t("media.used", { n: asset.usedCount })}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(asset.id)}
                  aria-label={t("media.delete")}
                  className="shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-soft)]"
                >
                  {t("carousels.delete")}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

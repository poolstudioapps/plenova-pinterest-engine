"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Input,
  PlantName,
  Select,
} from "@/components/ui";
import { groupByPlant, identityForAsset, normaliseSearch } from "@/lib/media";
import type { PlantIdentity } from "@/lib/data/localize";
import { translator } from "@/lib/i18n";
import type { MediaAsset } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

interface Props {
  initialAssets: MediaAsset[];
  plants: PlantIdentity[];
  styles: { slug: string; label: string }[];
}

/**
 * The library is browsed plant-first, because that is how you actually look for
 * a reusable image: "what do I already have for a Monstera?" rather than
 * "what did I generate last Tuesday?".
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

  const groups = useMemo(() => groupByPlant(filtered), [filtered]);

  async function remove(id: string) {
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setAssets((current) => current.filter((a) => a.id !== id));
  }

  if (assets.length === 0) {
    return <EmptyState title={t("media.empty")} description={t("media.emptyBody")} />;
  }

  return (
    <div className="space-y-6">
      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Select value={plantSlug} onChange={(e) => setPlantSlug(e.target.value)}>
          <option value="">{t("media.allPlants")}</option>
          {plants.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
        </Select>
        <Input
          type="search"
          placeholder={t("media.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      <p className="text-[13px] text-[var(--color-ink-soft)]">
        {t("media.count", { count: filtered.length, plants: groups.length })}
      </p>

      {groups.length === 0 ? (
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
                  { plantSlug: group.plantSlug, plantName: group.fallbackName, variety: null },
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
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] text-[var(--color-ink-faint)]">
                        {t("media.used", { n: asset.usedCount })} ·{" "}
                        {relativeTime(asset.createdAt)}
                      </span>
                    </div>
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
    </div>
  );
}

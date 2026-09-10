"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { groupByPlant, mediaLabel } from "@/lib/media";
import { translator, type Locale } from "@/lib/i18n";
import type { MediaAsset } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

interface Props {
  uiLocale: Locale;
  initialAssets: MediaAsset[];
  plants: { slug: string; name: string }[];
  styles: { slug: string; label: string }[];
}

/**
 * The library is browsed plant-first, because that is how you actually look for
 * a reusable image: "what do I already have for a Monstera?" rather than
 * "what did I generate last Tuesday?".
 */
export function MediaClient({ uiLocale, initialAssets, plants, styles }: Props) {
  const t = translator(uiLocale);
  const styleLabels = useMemo(
    () => new Map(styles.map((s) => [s.slug, s.label])),
    [styles],
  );
  const [assets, setAssets] = useState(initialAssets);
  const [plantSlug, setPlantSlug] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return assets.filter((a) => {
      if (plantSlug && a.plantSlug !== plantSlug) return false;
      if (!q) return true;
      return (
        a.plantName.toLowerCase().includes(q) ||
        (a.variety ?? "").toLowerCase().includes(q) ||
        a.prompt.toLowerCase().includes(q) ||
        a.tags.some((tag) => tag.includes(q))
      );
    });
  }, [assets, plantSlug, search]);

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
              {p.name}
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
            <h2 className="text-[15px] font-semibold">
              {group.plantName}{" "}
              <span className="font-normal text-[var(--color-ink-faint)]">
                ({group.assets.length})
              </span>
            </h2>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {group.assets.map((asset) => (
                <Card key={asset.id} className="overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt={mediaLabel(asset)}
                    className="aspect-pin w-full object-cover"
                  />
                  <div className="space-y-1.5 p-2.5">
                    {asset.variety ? (
                      <Badge className="w-full justify-center">{asset.variety}</Badge>
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

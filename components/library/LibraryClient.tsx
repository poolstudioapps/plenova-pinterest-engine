"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatusBadge,
} from "@/components/ui";
import { PinPreview } from "@/components/generate/PinPreview";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  translator,
  type Locale,
} from "@/lib/i18n";
import type { PinRecord, PinStatus } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

interface Props {
  uiLocale: Locale;
  initialPins: PinRecord[];
  plants: { slug: string; name: string }[];
  angles: { slug: string; label: string }[];
}

const STATUSES: PinStatus[] = [
  "draft",
  "generated",
  "queued",
  "scheduled",
  "publishing",
  "published",
  "failed",
];

export function LibraryClient({ uiLocale, initialPins, plants, angles }: Props) {
  const t = translator(uiLocale);
  const [pins, setPins] = useState(initialPins);
  const [pinLocale, setPinLocale] = useState("");
  const [variety, setVariety] = useState("");
  const [plantSlug, setPlantSlug] = useState("");
  const [angleSlug, setAngleSlug] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PinRecord | null>(null);

  // Filtering client-side keeps it instant; the dataset is small by design and
  // /api/pins applies the same predicates server-side when needed.
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return pins.filter((p) => {
      if (pinLocale && p.locale !== pinLocale) return false;
      if (variety && (p.variety ?? "") !== variety) return false;
      if (plantSlug && p.plantSlug !== plantSlug) return false;
      if (angleSlug && p.angleSlug !== angleSlug) return false;
      if (status && p.status !== status) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.keywords.some((k) => k.includes(q))
      );
    });
  }, [pins, pinLocale, variety, plantSlug, angleSlug, status, search]);

  // Cultivars are free text, so the filter list is derived from the data
  // rather than a fixed enum.
  const varieties = useMemo(
    () =>
      [...new Set(pins.map((p) => p.variety).filter((v): v is string => !!v))].sort(),
    [pins],
  );

  function applyChange(updated: PinRecord) {
    setPins((current) =>
      current.map((p) => (p.id === updated.id ? updated : p)),
    );
    setSelected(updated);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/pins/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setPins((current) => current.filter((p) => p.id !== id));
    setSelected((current) => (current?.id === id ? null : current));
  }

  if (pins.length === 0) {
    return (
      <EmptyState
        title={t("library.empty")}
        description={t("library.emptyBody")}
        action={
          <Button variant="primary" onClick={() => (location.href = "/generate")}>
            {t("library.emptyCta")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Select value={plantSlug} onChange={(e) => setPlantSlug(e.target.value)}>
          <option value="">{t("library.allPlants")}</option>
          {plants.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </Select>

        <Select value={angleSlug} onChange={(e) => setAngleSlug(e.target.value)}>
          <option value="">{t("library.allAngles")}</option>
          {angles.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.label}
            </option>
          ))}
        </Select>

        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("library.allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </Select>

        <Select
          value={variety}
          onChange={(e) => setVariety(e.target.value)}
          disabled={varieties.length === 0}
        >
          <option value="">{t("library.allVarieties")}</option>
          {varieties.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>

        <Select value={pinLocale} onChange={(e) => setPinLocale(e.target.value)}>
          <option value="">{t("library.allLanguages")}</option>
          {CONTENT_LOCALES.map((l) => (
            <option key={l} value={l}>
              {CONTENT_LOCALE_LABELS[l]}
            </option>
          ))}
        </Select>

        <Input
          type="search"
          placeholder={t("library.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {selected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-[var(--color-ink-soft)]">
              {t("library.editing")}: {selected.title}
            </p>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t("library.close")}
            </Button>
          </div>
          <PinPreview pin={selected} uiLocale={uiLocale} onChange={applyChange} />
        </div>
      ) : null}

      <p className="text-[13px] text-[var(--color-ink-soft)]">
        {t("library.count", { shown: filtered.length, total: pins.length })}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={t("library.noMatch")}
          description={t("library.noMatchBody")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((pin) => (
            <Card key={pin.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setSelected(pin)}
                className="block w-full text-left"
              >
                {pin.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pin.imageUrl}
                    alt={pin.altText}
                    className="aspect-pin w-full object-cover"
                  />
                ) : (
                  <div className="aspect-pin w-full bg-[var(--color-surface-muted)]" />
                )}
              </button>

              <div className="space-y-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-[13.5px] font-medium leading-snug">
                    {pin.title}
                  </p>
                  <StatusBadge status={pin.status} />
                </div>

                <p className="text-[12px] text-[var(--color-ink-faint)]">
                  {pin.variety ? `${pin.plantName} '${pin.variety}'` : pin.plantName}{" "}
                  · {pin.angleLabel}
                </p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-1.5">
                    <Badge className="uppercase">{pin.locale}</Badge>
                    <Badge>{relativeTime(pin.createdAt)}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-[12px]"
                      onClick={() => setSelected(pin)}
                    >
                      {t("library.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-[12px] text-[var(--color-danger)]"
                      onClick={() => void remove(pin.id)}
                    >
                      {t("library.delete")}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

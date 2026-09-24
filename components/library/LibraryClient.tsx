"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ButtonLink,
  EmptyState,
  Input,
  Picker,
  PlantName,
  StatusBadge,
} from "@/components/ui";
import { PinPreview } from "@/components/generate/PinPreview";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  translator,
  type TranslationKey,
} from "@/lib/i18n";
import { identityForAsset } from "@/lib/media";
import type { PlantIdentity } from "@/lib/data/localize";
import type { PinRecord, PinStatus } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

interface Props {
  initialPins: PinRecord[];
  plants: PlantIdentity[];
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

/**
 * A pin, named like an image.
 *
 * `PinRecord` and `MediaAsset` both carry a slug plus a flat name captured at
 * generation time, so the same resolver serves both rather than a second rule
 * drifting away from the first.
 */
function identityForPin(
  pin: { plantSlug: string; plantName: string; variety: string | null },
  catalog: Map<string, PlantIdentity>,
): PlantIdentity {
  return identityForAsset(pin, catalog);
}

/** The stored status is an English identifier; this is how it reads. */
const PIN_STATUS_KEYS: Record<PinStatus, TranslationKey> = {
  draft: "status.draft",
  generated: "status.generated",
  queued: "status.queued",
  scheduled: "status.scheduled",
  publishing: "status.publishing",
  published: "status.published",
  failed: "status.failed",
};

export function LibraryClient({ initialPins, plants, angles }: Props) {
  const t = translator();
  // Built from a prop, not imported: the plant catalog carries every care
  // field and has no business in a browser bundle.
  const catalog = useMemo(
    () => new Map(plants.map((p) => [p.slug, p])),
    [plants],
  );
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
          <ButtonLink href="/generate" variant="primary">
            {t("library.emptyCta")}
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* `p.primary` + `p.latin`, not the flat `p.label`: the picker draws a
            second line, so the botanical name no longer has to be folded into
            the first one to fit an <option>. */}
        <Picker
          options={[
            { value: "", label: t("library.allPlants") },
            ...plants.map((p) => ({
              value: p.slug,
              label: p.primary,
              ...(p.latin ? { detail: p.latin } : {}),
            })),
          ]}
          value={plantSlug}
          onChange={setPlantSlug}
        />

        <Picker
          options={[
            { value: "", label: t("library.allAngles") },
            ...angles.map((a) => ({ value: a.slug, label: a.label })),
          ]}
          value={angleSlug}
          onChange={setAngleSlug}
        />

        <Picker
          options={[
            { value: "", label: t("library.allStatuses") },
            ...STATUSES.map((s) => ({ value: s, label: t(PIN_STATUS_KEYS[s]) })),
          ]}
          value={status}
          onChange={setStatus}
        />

        {/* With no cultivars in the data the list holds only "Tous les
            cultivars": the picker has no disabled state, and an empty one says
            the same thing by having nothing else to pick. */}
        <Picker
          options={[
            { value: "", label: t("library.allVarieties") },
            ...varieties.map((v) => ({ value: v, label: v })),
          ]}
          value={variety}
          onChange={setVariety}
        />

        <Picker
          options={[
            { value: "", label: t("library.allLanguages") },
            ...CONTENT_LOCALES.map((l) => ({
              value: l,
              label: CONTENT_LOCALE_LABELS[l],
            })),
          ]}
          value={pinLocale}
          onChange={setPinLocale}
        />

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
          <PinPreview pin={selected} plants={plants} onChange={applyChange} />
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

                <div className="space-y-0.5">
                  <PlantName
                    size="sm"
                    identity={identityForPin(pin, catalog)}
                  />
                  <p className="truncate text-[12px] text-[var(--color-ink-faint)]">
                    {pin.angleLabel}
                  </p>
                </div>

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

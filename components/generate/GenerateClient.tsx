"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from "@/components/ui";
import { PinPreview } from "@/components/generate/PinPreview";
import {
  LOCALES,
  LOCALE_LABELS,
  translator,
  type Locale,
} from "@/lib/i18n";
import type { MediaAsset, PinRecord } from "@/lib/types";

interface Option {
  slug: string;
  label: string;
}

interface Props {
  uiLocale: Locale;
  plants: { slug: string; name: string }[];
  angles: { slug: string; label: string; category: string }[];
  styles: Option[];
  categories: { key: string; label: string }[];
  canGenerate: boolean;
}

export function GenerateClient({
  uiLocale,
  plants,
  angles,
  styles,
  categories,
  canGenerate,
}: Props) {
  const t = translator(uiLocale);

  const [plantSlug, setPlantSlug] = useState(plants[0]?.slug ?? "");
  const [angleSlug, setAngleSlug] = useState(angles[0]?.slug ?? "");
  // The Pin language defaults to the dashboard language but is independent:
  // an English-speaking operator may well be producing French Pins.
  const [pinLocale, setPinLocale] = useState<Locale>(uiLocale);
  const [visualStyle, setVisualStyle] = useState("");
  const [customAngle, setCustomAngle] = useState("");
  const [variety, setVariety] = useState("");
  const [reuseMediaId, setReuseMediaId] = useState("");
  const [reusable, setReusable] = useState<MediaAsset[]>([]);
  const [variation, setVariation] = useState(0);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState<PinRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateHint, setDuplicateHint] = useState(false);

  // Reusable images are scoped to the selected plant - that is the only axis
  // on which reuse makes sense, and it keeps the list short.
  useEffect(() => {
    let cancelled = false;
    setReuseMediaId("");
    void (async () => {
      try {
        const res = await fetch(
          `/api/media?plantSlug=${encodeURIComponent(plantSlug)}&limit=60`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { media: MediaAsset[] };
        if (!cancelled) setReusable(data.media);
      } catch {
        // The picker is an optimisation; generation works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plantSlug]);

  // Map style slug -> localized label so the reuse picker reads like the rest
  // of the form rather than exposing slugs.
  const styleLabels = useMemo(
    () => new Map(styles.map((st) => [st.slug, st.label])),
    [styles],
  );

  const grouped = useMemo(
    () =>
      categories.map((c) => ({
        ...c,
        items: angles.filter((a) => a.category === c.key),
      })),
    [angles, categories],
  );

  async function onGenerate() {
    setLoading(true);
    setError(null);
    setDuplicateHint(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantSlug,
          angleSlug,
          locale: pinLocale,
          variety: variety.trim() || undefined,
          reuseMediaId: reuseMediaId || undefined,
          visualStyle: visualStyle || undefined,
          customAngle: customAngle.trim() || undefined,
          variation,
          allowDuplicate,
        }),
      });

      const body = (await res.json()) as {
        pin?: PinRecord;
        error?: { code?: string; message?: string };
      };

      if (!res.ok) {
        setError(body.error?.message ?? t("generate.failed"));
        if (body.error?.code === "duplicate") setDuplicateHint(true);
        return;
      }
      if (body.pin) setPin(body.pin);
    } catch {
      setError(t("generate.unreachable"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card className="h-fit p-5">
        <div className="space-y-4">
          <Field label={t("generate.plant")} htmlFor="plant">
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

          <Field label={t("generate.angle")} htmlFor="angle">
            <Select
              id="angle"
              value={angleSlug}
              onChange={(e) => setAngleSlug(e.target.value)}
            >
              {grouped.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {group.items.map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <Field
            label={t("generate.pinLanguage")}
            htmlFor="pin-locale"
            hint={t("generate.pinLanguageHint")}
          >
            <Select
              id="pin-locale"
              value={pinLocale}
              onChange={(e) => setPinLocale(e.target.value as Locale)}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t("generate.variety")}
            htmlFor="variety"
            hint={t("generate.varietyHint")}
          >
            <Input
              id="variety"
              maxLength={60}
              placeholder="variegata"
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
            />
          </Field>

          <Field
            label={t("generate.reuse")}
            htmlFor="reuse"
            hint={
              reusable.length > 0
                ? t("generate.reuseAvailable", { n: reusable.length })
                : t("generate.reuseHint")
            }
          >
            <Select
              id="reuse"
              value={reuseMediaId}
              disabled={reusable.length === 0}
              onChange={(e) => setReuseMediaId(e.target.value)}
            >
              <option value="">{t("generate.reuseNone")}</option>
              {reusable.map((a) => (
                <option key={a.id} value={a.id}>
                  {[
                    a.variety,
                    styleLabels.get(a.visualStyle) ?? a.visualStyle,
                    t("media.used", { n: a.usedCount }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t("generate.style")}
            htmlFor="style"
            hint={t("generate.styleHint")}
          >
            <Select
              id="style"
              value={visualStyle}
              onChange={(e) => setVisualStyle(e.target.value)}
            >
              <option value="">{t("generate.styleAuto")}</option>
              {styles.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t("generate.custom")}
            htmlFor="custom"
            hint={t("generate.customHint")}
          >
            <Textarea
              id="custom"
              rows={3}
              maxLength={400}
              placeholder={t("generate.customPlaceholder")}
              value={customAngle}
              onChange={(e) => setCustomAngle(e.target.value)}
            />
          </Field>

          <Field
            label={t("generate.variation")}
            htmlFor="variation"
            hint={t("generate.variationHint")}
          >
            <Input
              id="variation"
              type="number"
              min={0}
              max={999}
              value={variation}
              onChange={(e) => setVariation(Number(e.target.value) || 0)}
            />
          </Field>

          <label className="flex items-start gap-2.5 text-[13px] text-[var(--color-ink-soft)]">
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-accent)]"
            />
            <span>{t("generate.regenerate")}</span>
          </label>

          <Button
            variant="primary"
            className="w-full"
            onClick={onGenerate}
            loading={loading}
            disabled={!canGenerate}
          >
            {loading ? t("generate.working") : t("generate.cta")}
          </Button>

          {!canGenerate ? <Notice tone="warn">{t("generate.needKey")}</Notice> : null}

          {error ? (
            <Notice tone="danger" title={t("generate.failed")}>
              {error}
              {duplicateHint ? (
                <span className="mt-1.5 block">{t("generate.duplicateHint")}</span>
              ) : null}
            </Notice>
          ) : null}
        </div>
      </Card>

      <PinPreview pin={pin} loading={loading} uiLocale={uiLocale} />
    </div>
  );
}

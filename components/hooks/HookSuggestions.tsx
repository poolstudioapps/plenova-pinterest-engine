"use client";

import { useState } from "react";
import { Button, Field, Input, Notice, Picker } from "@/components/ui";
import type { PlantIdentity } from "@/lib/data/localize";
import { translator } from "@/lib/i18n";
import type { Hook } from "@/lib/types";
import { cn } from "@/lib/utils";

const COUNT = 6;

/**
 * Asks Gemini for hooks that are none of the ones already in the bank - the
 * server sends it the whole list and checks what comes back against it.
 *
 * Nothing is saved on its own: "Garder" files a suggestion as an idea,
 * "Utiliser" hands it to whoever asked (the carousel form, or the hooks page
 * which opens a carousel with it).
 */
export function HookSuggestions({
  plants,
  onKept,
  onUse,
  className,
}: {
  plants: PlantIdentity[];
  onKept: (hook: Hook) => void;
  onUse: (text: string) => void;
  className?: string;
}) {
  const t = translator();
  const [direction, setDirection] = useState("");
  const [plantSlug, setPlantSlug] = useState("");
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hooks/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: COUNT, plantSlug: plantSlug || undefined, direction }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        suggestions?: string[];
        error?: { message?: string };
      };
      if (!res.ok || !data.suggestions) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      setSuggestions(data.suggestions);
      setKept(new Set());
    } catch {
      setError(t("preview.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  async function keep(text: string) {
    setError(null);
    try {
      const res = await fetch("/api/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "gemini" }),
      });
      const data = (await res.json().catch(() => ({}))) as { hook?: Hook; error?: { message?: string } };
      if (!res.ok || !data.hook) {
        setError(data.error?.message ?? t("preview.requestFailed"));
        return;
      }
      setKept((current) => new Set(current).add(text));
      onKept(data.hook);
    } catch {
      setError(t("preview.unreachable"));
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">{t("hooks.suggestHint")}</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <Field label={t("hooks.suggestDirection")} htmlFor="hook-direction">
          <Input
            id="hook-direction"
            value={direction}
            maxLength={300}
            placeholder={t("hooks.suggestDirectionPlaceholder")}
            onChange={(e) => setDirection(e.target.value)}
          />
        </Field>
        <Field label={t("hooks.suggestPlant")} htmlFor="hook-plant">
          <Picker
            id="hook-plant"
            options={[
              { value: "", label: t("hooks.anyPlant") },
              ...plants.map((p) => ({ value: p.slug, label: p.primary, ...(p.latin ? { detail: p.latin } : {}) })),
            ]}
            value={plantSlug}
            onChange={setPlantSlug}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void suggest()} loading={busy} disabled={busy}>
          {busy
            ? t("hooks.suggesting")
            : suggestions
              ? t("hooks.suggestAgain")
              : t("hooks.suggest", { n: COUNT })}
        </Button>
        {suggestions && suggestions.length > 1 && kept.size < suggestions.length ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              for (const s of suggestions) if (!kept.has(s)) void keep(s);
            }}
          >
            {t("hooks.keepAll")}
          </Button>
        ) : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {suggestions ? (
        suggestions.length === 0 ? (
          <p className="text-[12.5px] text-[var(--color-ink-faint)]">{t("hooks.suggestNone")}</p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)] rounded-[12px] border border-[var(--color-line)]">
            {suggestions.map((text) => (
              <li key={text} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                <span className="min-w-0 flex-1 text-[14px] font-medium">{text}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void keep(text)}
                  disabled={kept.has(text)}
                >
                  {kept.has(text) ? t("hooks.kept") : t("hooks.keep")}
                </Button>
                <Button size="sm" onClick={() => onUse(text)}>
                  {t("hooks.useNow")}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

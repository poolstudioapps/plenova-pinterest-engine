"use client";

import { useState } from "react";
import Link from "next/link";
import { HookSuggestions } from "@/components/hooks/HookSuggestions";
import { Spinner } from "@/components/ui";
import type { PlantIdentity } from "@/lib/data/localize";
import { translator } from "@/lib/i18n";
import type { Hook } from "@/lib/types";

/**
 * Under the theme field of a new carousel: the ideas kept in the bank, and
 * fresh ones from Gemini. Picking one writes it into the field; the carousel
 * marks it used when it starts, so it is never suggested again.
 *
 * Opens inline rather than as a floating menu - it holds a form, and the card
 * it sits in clips anything that floats.
 */
export function HookPicker({
  plants,
  onPick,
}: {
  plants: PlantIdentity[];
  onPick: (text: string) => void;
}) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState<Hook[] | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && ideas === null) {
      try {
        const res = await fetch("/api/hooks");
        const data = (await res.json()) as { hooks?: Hook[] };
        setIdeas((data.hooks ?? []).filter((h) => h.status === "idea"));
      } catch {
        setIdeas([]);
      }
    }
  }

  function pick(text: string) {
    onPick(text);
    setOpen(false);
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-[12.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] aria-expanded:border-[var(--color-accent)] aria-expanded:text-[var(--color-accent-ink)]"
      >
        <span aria-hidden>✦</span>
        {t("carousels.hooksButton")}
      </button>

      {open ? (
        <div className="mt-3 space-y-4 rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface-muted)] p-4">
          <div>
            <p className="mb-2 text-[12.5px] font-semibold text-[var(--color-ink-soft)]">
              {t("carousels.hooksIdeas")}
            </p>
            {ideas === null ? (
              <Spinner />
            ) : ideas.length === 0 ? (
              <p className="text-[12.5px] text-[var(--color-ink-faint)]">{t("carousels.hooksNoIdeas")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ideas.slice(0, 20).map((hook) => (
                  <button
                    key={hook.id}
                    type="button"
                    onClick={() => pick(hook.text)}
                    className="rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-left text-[13px] transition-colors hover:border-[var(--color-accent)]"
                  >
                    {hook.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          <HookSuggestions
            plants={plants}
            onKept={(hook) => setIdeas((current) => [hook, ...(current ?? [])])}
            onUse={pick}
          />

          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3 text-[12.5px]">
            <Link href="/hooks" className="font-medium text-[var(--color-accent)] hover:underline">
              {t("carousels.hooksManage")}
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              {t("carousels.hooksClose")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

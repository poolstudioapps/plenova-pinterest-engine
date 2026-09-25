"use client";

import { useState } from "react";
import Link from "next/link";
import { HookSuggestions } from "@/components/hooks/HookSuggestions";
import { HookThumb, TierBadge } from "@/components/hooks/parts";
import { Spinner } from "@/components/ui";
import type { PlantIdentity } from "@/lib/data/localize";
import { assignTiers, type Tier } from "@/lib/hook-tiers";
import { translator } from "@/lib/i18n";
import { compactNumber } from "@/lib/spy-format";
import type { HookView } from "@/lib/types";

const SHOWN = 24;

/**
 * Under the theme field of a new carousel: the ideas kept in the bank - the
 * ones proven on the watched accounts first, best tier on top - and fresh ones
 * from Gemini. Picking one writes it into the field; the carousel marks it
 * used when it starts, so it is never suggested again.
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
  const [ideas, setIdeas] = useState<HookView[] | null>(null);
  const [tiers, setTiers] = useState<Map<string, Tier>>(new Map());

  /*
   * Fetched on every opening, never kept: a carousel started since marked its
   * hook used, and offering it again is exactly what the bank is for.
   */
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setIdeas(null);
      try {
        const res = await fetch("/api/hooks", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { hooks?: HookView[] };
        const all = data.hooks ?? [];
        setTiers(assignTiers(all));
        setIdeas(
          all
            .filter((h) => h.status === "idea")
            // Proven first, by the views they brought; then the newest of ours.
            .sort(
              (a, b) =>
                (b.spy?.views ?? -1) - (a.spy?.views ?? -1) ||
                b.createdAt.localeCompare(a.createdAt),
            ),
        );
      } catch {
        setIdeas([]);
      }
    }
  }

  function pick(text: string) {
    onPick(text);
    setIdeas((current) => (current ? current.filter((h) => h.text !== text) : current));
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
              <ul className="grid max-h-[340px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {ideas.slice(0, SHOWN).map((hook) => {
                  const tier = tiers.get(hook.id);
                  return (
                    <li key={hook.id}>
                      <button
                        type="button"
                        onClick={() => pick(hook.text)}
                        className="flex w-full items-center gap-2.5 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 pr-3 text-left transition-colors hover:border-[var(--color-accent)]"
                      >
                        {hook.spy ? (
                          <HookThumb src={hook.spy.images[0]?.url} className="h-[52px] w-[39px]" />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-[13px] leading-snug font-medium">{hook.text}</span>
                          {hook.spy ? (
                            <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--color-ink-faint)]">
                              {tier ? <TierBadge tier={tier} /> : null}
                              <span className="tabular-nums">
                                {compactNumber(hook.spy.views)} {t("hooks.views")}
                              </span>
                              <span className="truncate">@{hook.spy.username}</span>
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <HookSuggestions
            plants={plants}
            // Just kept: on top, where it can be seen, whatever the ranking.
            onKept={(hook) =>
              setIdeas((current) => [{ ...hook, spy: null }, ...(current ?? []).filter((h) => h.id !== hook.id)])
            }
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

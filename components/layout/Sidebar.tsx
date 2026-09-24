"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlenovaMark } from "@/components/layout/PlenovaMark";
import { translator, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Navigation grouped by channel.
 *
 * A flat list of eight items gave no clue what belonged to what - "Library",
 * "Media" and "Queue" could each have been either channel. Grouping by
 * destination makes the shape of the tool legible: each channel owns its
 * production steps and its own account page, and only the image library sits
 * outside, because it genuinely is shared.
 */
const GROUPS: {
  key: string;
  labelKey?: TranslationKey;
  items: { href: string; key: TranslationKey }[];
}[] = [
  {
    key: "top",
    items: [{ href: "/", key: "nav.dashboard" }],
  },
  {
    key: "pinterest",
    labelKey: "nav.groupPinterest",
    items: [
      { href: "/generate", key: "nav.generate" },
      { href: "/library", key: "nav.library" },
      { href: "/queue", key: "nav.queue" },
      { href: "/pinterest", key: "nav.accountPinterest" },
    ],
  },
  {
    key: "tiktok",
    labelKey: "nav.groupTikTok",
    items: [
      { href: "/carousels", key: "nav.carousels" },
      { href: "/tiktok", key: "nav.accountTikTok" },
    ],
  },
  {
    key: "shared",
    labelKey: "nav.groupShared",
    items: [{ href: "/media", key: "nav.media" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const t = translator();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Navigation principale"
      className="flex gap-1 overflow-x-auto border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 md:sticky md:top-0 md:h-dvh md:w-64 md:shrink-0 md:flex-col md:gap-0 md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-6"
    >
      <div className="mb-0 hidden items-center gap-2.5 px-3 md:mb-7 md:flex">
        <PlenovaMark size={32} />
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-[-0.01em]">Plenova</p>
          <p className="text-[11.5px] text-[var(--color-ink-faint)]">Studio</p>
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group.key} className="contents md:mb-5 md:block">
          {group.labelKey ? (
            <p className="hidden px-3 pt-1 pb-2 text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-faint)] uppercase md:block">
              {t(group.labelKey)}
            </p>
          ) : null}

          {group.items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative shrink-0 rounded-[9px] px-3 py-2 text-[14px] transition-colors md:block",
                  active
                    ? "bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent-ink)]"
                    : "font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]",
                )}
              >
                {/* A marker on the edge, so the current page is findable
                    without relying on a tint alone. */}
                {active ? (
                  <span
                    aria-hidden
                    className="absolute top-1/2 -left-3 hidden h-5 w-1 -translate-y-1/2 rounded-r bg-[var(--color-accent)] md:block"
                  />
                ) : null}
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      ))}

    </nav>
  );
}

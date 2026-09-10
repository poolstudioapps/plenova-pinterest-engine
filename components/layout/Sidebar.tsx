"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { translator, type Locale } from "@/lib/i18n";
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
  labelKey?: string;
  items: { href: string; key: string }[];
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
      { href: "/pinterest", key: "nav.account" },
    ],
  },
  {
    key: "tiktok",
    labelKey: "nav.groupTikTok",
    items: [
      { href: "/carousels", key: "nav.carousels" },
      { href: "/tiktok", key: "nav.account" },
    ],
  },
  {
    key: "shared",
    labelKey: "nav.groupShared",
    items: [{ href: "/media", key: "nav.media" }],
  },
];

export function Sidebar({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const t = translator(locale);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Main"
      className="flex gap-1 overflow-x-auto border-b border-[var(--color-line)] px-4 py-3 md:h-dvh md:w-60 md:shrink-0 md:flex-col md:gap-0 md:overflow-y-auto md:border-r md:border-b-0 md:px-4 md:py-6"
    >
      <div className="mb-0 hidden items-center gap-2.5 px-3 md:mb-7 md:flex">
        <span className="grid size-8 place-items-center rounded-[9px] bg-[var(--color-accent)] text-[15px] font-semibold text-white">
          P
        </span>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-[-0.01em]">Plenova</p>
          <p className="text-[11.5px] text-[var(--color-ink-faint)]">Studio</p>
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group.key} className="contents md:mb-5 md:block">
          {group.labelKey ? (
            <p className="hidden px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.07em] text-[var(--color-ink-faint)] uppercase md:block">
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
                  "shrink-0 rounded-[9px] px-3 py-1.5 text-[13.5px] font-medium transition-colors md:block",
                  active
                    ? "bg-[var(--color-surface-muted)] text-[var(--color-ink)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]",
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="ml-auto shrink-0 self-center md:mt-auto md:ml-0 md:w-full md:self-auto">
        <LocaleSwitcher current={locale} />
      </div>
    </nav>
  );
}

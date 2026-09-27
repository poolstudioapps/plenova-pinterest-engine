"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Binoculars,
  Bug,
  Cards,
  ChartLineUp,
  Images,
  PinterestLogo,
  PushPin,
  Queue,
  Quotes,
  SignOut,
  Sparkle,
  SquaresFour,
  Sword,
  TiktokLogo,
  type Icon,
} from "@phosphor-icons/react";
import { setAragogEnabled, useAragogEnabled } from "@/components/fun/aragog-pref";
import { PlenovaMark } from "@/components/layout/PlenovaMark";
import { Indicator, useIndicator } from "@/components/ui/Indicator";
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
 *
 * Each item carries an icon: a column of words reads as a list, a column of
 * shapes is found at a glance - and on a phone, where the group names do not
 * fit, the icons are what still says which channel an item belongs to.
 */
const GROUPS: {
  key: string;
  labelKey?: TranslationKey;
  items: { href: string; key: TranslationKey; icon: Icon }[];
}[] = [
  {
    key: "top",
    items: [
      // The app's business: revenue, usage, acquisition (RevenueCat, Amplitude, AppsFlyer).
      { href: "/performances", key: "nav.performance", icon: ChartLineUp },
      // The content side: carousels and Pins.
      { href: "/", key: "nav.dashboard", icon: SquaresFour },
      // Our own accounts, Mr Stark against Mr Mousk.
      { href: "/versus", key: "nav.versus", icon: Sword },
    ],
  },
  // TikTok first: carousels are where most of the work happens now.
  {
    key: "tiktok",
    labelKey: "nav.groupTikTok",
    items: [
      { href: "/carousels", key: "nav.carousels", icon: Cards },
      { href: "/hooks", key: "nav.hooks", icon: Quotes },
      { href: "/spy", key: "nav.spy", icon: Binoculars },
      { href: "/tiktok", key: "nav.accountTikTok", icon: TiktokLogo },
    ],
  },
  {
    key: "pinterest",
    labelKey: "nav.groupPinterest",
    items: [
      { href: "/generate", key: "nav.generate", icon: Sparkle },
      { href: "/library", key: "nav.library", icon: PushPin },
      { href: "/queue", key: "nav.queue", icon: Queue },
      { href: "/pinterest", key: "nav.accountPinterest", icon: PinterestLogo },
    ],
  },
  {
    key: "shared",
    labelKey: "nav.groupShared",
    items: [{ href: "/media", key: "nav.media", icon: Images }],
  },
];

export function Sidebar({
  email,
  showPerformance,
}: {
  email: string | null;
  showPerformance: boolean;
}) {
  const pathname = usePathname();
  const t = translator();
  const [leaving, setLeaving] = useState(false);
  // The white highlight of the current page slides to the next one on a click.
  const nav = useIndicator<HTMLDivElement>(pathname);
  const strip = nav.ref;

  async function signOut() {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // A full load, so nothing of the signed-in screens stays in memory.
      window.location.href = "/login";
    }
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  /*
   * On a phone the items are one scrolling strip, and the current page could
   * sit off to the right with nothing on screen saying where you are. The
   * strip scrolls itself so the current item is in view - its own scroll
   * only, never the page's.
   */
  useEffect(() => {
    const el = strip.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !current || el.scrollWidth <= el.clientWidth) return;
    const target = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "instant" });
  }, [pathname]);

  const items = GROUPS.map((group) => ({
    ...group,
    // Performances only for the addresses that see revenue.
    items: group.items.filter((item) => item.href !== "/performances" || showPerformance),
  }));

  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        // Phone: a strip stuck to the top, frosted over the page it scrolls above.
        "sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--color-edge)] bg-[var(--color-frame)]/85 pt-[env(safe-area-inset-top)] backdrop-blur-md",
        // Wider: a column on the frame, beside the sheet the pages sit on.
        "md:h-dvh md:w-60 md:shrink-0 md:flex-col md:items-stretch md:gap-0 md:border-b-0 md:bg-transparent md:px-3 md:pt-5 md:pb-3 md:backdrop-blur-none",
      )}
    >
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2.5 rounded-[12px] py-2 pl-4 md:mb-6 md:px-2.5 md:py-1"
        aria-label="Plenova Studio"
      >
        <PlenovaMark size={30} className="size-7 md:size-[30px]" />
        <span className="hidden leading-none md:block">
          <span className="block text-[14.5px] font-semibold tracking-[-0.015em]">
            Plenova
          </span>
          <span className="mt-1 block text-[11.5px] text-[var(--color-ink-faint)]">
            Studio
          </span>
        </span>
      </Link>

      <div
        ref={strip}
        data-indicator={nav.ready ? "ready" : undefined}
        className={cn(
          "group/nav relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-2 pr-4 pl-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // The strip fades out at its edges: there is more that way.
          "[mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-28px),transparent)]",
          "md:flex-col md:items-stretch md:gap-0 md:overflow-x-visible md:overflow-y-auto md:py-0 md:pr-0 md:pl-0 md:[mask-image:none]",
        )}
      >
        <Indicator
          box={nav.box}
          moving={nav.moving}
          className="rounded-[10px] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
        />
        {items.map((group) =>
          group.items.length === 0 ? null : (
            <div key={group.key} className="flex shrink-0 md:mb-5 md:block">
              {group.labelKey ? (
                <p className="hidden px-2.5 pb-1.5 text-[12px] font-medium text-[var(--color-ink-faint)] md:block">
                  {t(group.labelKey)}
                </p>
              ) : null}
              <ul className="flex gap-0.5 md:block md:space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Glyph = item.icon;
                  return (
                    <li key={item.href} className="shrink-0">
                      <Link
                        href={item.href}
                        // Every page reads the database; prefetching all twelve
                        // on every view would be twelve server calls for pages
                        // mostly never opened. The loading skeleton still
                        // shows on the click.
                        prefetch={false}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex shrink-0 items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[13.5px] whitespace-nowrap transition-[background-color,color,box-shadow,scale] duration-150 active:scale-[0.97] md:gap-2.5 md:py-[7px] md:text-[14px]",
                          active
                            ? "bg-[var(--color-surface)] font-semibold text-[var(--color-ink)] shadow-[var(--shadow-card)] group-data-[indicator=ready]/nav:bg-transparent group-data-[indicator=ready]/nav:shadow-none"
                            : "font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]/55 hover:text-[var(--color-ink)]",
                        )}
                      >
                        <Glyph
                          aria-hidden
                          size={18}
                          weight={active ? "duotone" : "regular"}
                          className={cn(
                            "shrink-0 transition-colors",
                            active
                              ? "text-[var(--color-accent)]"
                              : "text-[var(--color-ink-faint)] group-hover:text-[var(--color-ink-soft)]",
                          )}
                        />
                        {t(item.key)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ),
        )}

        {/* On a phone, signing out is the last stop of the strip. */}
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={leaving}
          className="flex shrink-0 items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[13.5px] font-medium whitespace-nowrap text-[var(--color-ink-faint)] disabled:opacity-50 md:hidden"
        >
          <SignOut aria-hidden size={18} />
          {leaving ? t("nav.signingOut") : t("nav.signOut")}
        </button>
      </div>

      <div className="mt-auto hidden border-t border-[var(--color-edge)] px-1 pt-3 md:block">
        <AragogSwitch />
        {email ? (
          <p
            className="truncate px-1.5 pb-1 text-[12px] text-[var(--color-ink-faint)]"
            title={email}
          >
            {email}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={leaving}
          className="group flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-[7px] text-left text-[13.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface)]/55 hover:text-[var(--color-ink)] disabled:opacity-50"
        >
          <SignOut
            aria-hidden
            size={18}
            className="text-[var(--color-ink-faint)] transition-colors group-hover:text-[var(--color-ink-soft)]"
          />
          {leaving ? t("nav.signingOut") : t("nav.signOut")}
        </button>
      </div>
    </nav>
  );
}

/**
 * Lets Aragog out, or keeps it in. Remembered on this computer. Only beside
 * the desktop menu: the spider follows a mouse, it never shows on a phone.
 */
function AragogSwitch() {
  const on = useAragogEnabled();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setAragogEnabled(!on)}
      className="group mb-1 flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-[7px] text-left text-[13.5px] font-medium text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface)]/55 hover:text-[var(--color-ink)]"
    >
      <Bug
        aria-hidden
        size={18}
        weight={on ? "fill" : "regular"}
        className={cn(
          "transition-colors",
          on ? "text-[var(--color-ink)]" : "text-[var(--color-ink-faint)] group-hover:text-[var(--color-ink-soft)]",
        )}
      />
      <span className="flex-1">Aragog</span>
      {/* The track fills, the knob slides across: a switch, not a checkbox. */}
      <span
        aria-hidden
        className={cn(
          "relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-200",
          on ? "bg-[var(--color-accent)]" : "bg-[var(--color-line-strong)]",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] left-[2px] size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-[var(--ease-out)]",
            on && "translate-x-[12px]",
          )}
        />
      </span>
    </button>
  );
}

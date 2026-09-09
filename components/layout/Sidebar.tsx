"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { translator, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", key: "nav.dashboard" },
  { href: "/generate", key: "nav.generate" },
  { href: "/library", key: "nav.library" },
  { href: "/queue", key: "nav.queue" },
  { href: "/pinterest", key: "nav.pinterest" },
] as const;

export function Sidebar({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const t = translator(locale);

  return (
    <nav
      aria-label="Main"
      className="flex gap-1 overflow-x-auto border-b border-[var(--color-line)] px-4 py-3 md:h-dvh md:w-60 md:shrink-0 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-4 md:py-6"
    >
      <div className="mb-0 hidden items-center gap-2.5 px-3 md:mb-8 md:flex">
        <span className="grid size-8 place-items-center rounded-[9px] bg-[var(--color-accent)] text-[15px] font-semibold text-white">
          P
        </span>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-[-0.01em]">Plenova</p>
          <p className="text-[11.5px] text-[var(--color-ink-faint)]">
            Pinterest Engine
          </p>
        </div>
      </div>

      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors",
              active
                ? "bg-[var(--color-surface-muted)] text-[var(--color-ink)]"
                : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}

      <div className="ml-auto shrink-0 self-center md:mt-auto md:ml-0 md:w-full md:self-auto">
        <LocaleSwitcher current={locale} />
      </div>
    </nav>
  );
}

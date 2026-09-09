"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Switches the dashboard language. Persisted in a plain cookie and read by the
 * server components, so the whole page re-renders in the new language without
 * duplicating every route under a /[locale] segment.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(locale: Locale) {
    if (locale === current) return;
    // One year, root path, lax - this is a display preference, not a secret.
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "flex gap-0.5 rounded-[9px] border border-[var(--color-line)] p-0.5",
        pending && "opacity-60",
      )}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => select(locale)}
          aria-pressed={locale === current}
          className={cn(
            "flex-1 rounded-[6px] px-2 py-1 text-[12px] font-medium transition-colors",
            locale === current
              ? "bg-[var(--color-surface-muted)] text-[var(--color-ink)]"
              : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]",
          )}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}

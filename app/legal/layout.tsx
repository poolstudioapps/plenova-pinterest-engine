import type { ReactNode } from "react";

/**
 * Legal pages sit outside the dashboard shell: they are read by platform
 * reviewers (TikTok, Pinterest) who are not signed in, so they must not carry
 * the app navigation or depend on any session.
 *
 * The matching allowlist entry lives in lib/auth.ts.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:py-16">
      <article className="space-y-5 text-[14.5px] leading-relaxed text-[var(--color-ink-soft)] [&_h2]:mt-8 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-[var(--color-ink)] [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-[var(--color-ink)]">
        {children}
      </article>
    </div>
  );
}

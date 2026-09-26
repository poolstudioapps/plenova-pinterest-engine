"use client";

import { cn } from "@/lib/utils";

/** How many cards a page shows at most - long lists of image cards slowed the browser down. */
export const PAGE_SIZE = 20;

/** The slice of `items` on page `page` (1-based), and how many pages there are. */
export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages };
}

/** The page numbers worth a button: the first, the last, and those around the current one. */
function visiblePages(page: number, pages: number): (number | "…")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/** Previous / numbers / next. Renders nothing for a single page. */
export function Pager({
  page,
  pages,
  total,
  onChange,
  className,
}: {
  page: number;
  pages: number;
  /** Items across all pages, for the "21-40 sur 188" line. */
  total: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (pages <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  const button =
    "grid h-8 min-w-8 place-items-center rounded-[8px] px-2 text-[13px] font-medium transition-colors disabled:opacity-40";

  return (
    <nav aria-label="Pages" className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-[12.5px] text-[var(--color-ink-faint)] tabular-nums">
        {from}-{to} sur {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(button, "hover:bg-[var(--color-surface-muted)]")}
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Page précédente"
        >
          ‹
        </button>
        {visiblePages(page, pages).map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-[13px] text-[var(--color-ink-faint)]">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                button,
                "tabular-nums",
                n === page
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-muted)]",
              )}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className={cn(button, "hover:bg-[var(--color-surface-muted)]")}
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          aria-label="Page suivante"
        >
          ›
        </button>
      </div>
    </nav>
  );
}

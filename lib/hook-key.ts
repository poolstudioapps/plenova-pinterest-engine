/**
 * When two hooks are the same hook.
 *
 * Shared by the server, which refuses duplicates, and the page, which warns
 * before one is typed in full. Case, accents, punctuation and emoji never make
 * a hook new: "Top 5 plantes faciles !" is "top 5 plantes faciles".
 */

export const HOOK_MAX_LENGTH = 200;

export function hookKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words that carry the idea, for telling a reworded copy from a new hook. */
function words(key: string): Set<string> {
  return new Set(key.split(" ").filter((w) => w.length > 2));
}

/**
 * The same hook, or a copy of it with a word or two changed.
 *
 * "Les 6 plus belles Monstera à avoir chez toi" and "Les 6 plus belles
 * Monstera chez toi" are one idea; "Les 6 Monstera les plus faciles" is not.
 */
export function sameHook(a: string, b: string): boolean {
  const ka = hookKey(a);
  const kb = hookKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const wa = words(ka);
  const wb = words(kb);
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / (wa.size + wb.size - shared) >= 0.8;
}

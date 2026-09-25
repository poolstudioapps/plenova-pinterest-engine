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

/**
 * Words that carry no idea of their own. Counted, they made two hooks look
 * alike just for sharing "les", "qui" and "pour".
 */
const STOPWORDS = new Set(
  (
    "les des une un le la de du et ou a au aux en dans sur sous pour par avec sans qui que quoi " +
    "ce cet cette ces ton ta tes mon ma mes son sa ses leur leurs notre nos votre vos est sont " +
    "pas plus tres tout tous toute toutes ne se si mais donc car il elle ils elles tu te toi je me moi " +
    "on nous vous y the of to in on for with and or your you my is are this that it its"
  ).split(" "),
);

/** Words that carry the idea, for telling a reworded copy from a new hook. */
function words(key: string): Set<string> {
  return new Set(key.split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}

/**
 * The same hook, or a copy of it with a word or two changed.
 *
 * "Les 6 plus belles Monstera à avoir chez toi" and "Les 6 plus belles
 * Monstera chez toi" are one idea; "Les 6 Monstera les plus faciles" is not.
 *
 * `vetoes` are words that make a hook a different hook on their own - plant
 * names, passed in by the server from the catalog: the same sentence about a
 * pothos and about a calathea is two carousels, however alike the rest.
 */
export function sameHook(a: string, b: string, vetoes?: ReadonlySet<string>): boolean {
  const ka = hookKey(a);
  const kb = hookKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const wa = words(ka);
  const wb = words(kb);
  if (wa.size === 0 || wb.size === 0) return false;
  if (vetoes) {
    for (const w of wa) if (!wb.has(w) && vetoes.has(w)) return false;
    for (const w of wb) if (!wa.has(w) && vetoes.has(w)) return false;
  }
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  // Three words in four in common, once the empty ones are gone.
  return shared / (wa.size + wb.size - shared) >= 0.75;
}

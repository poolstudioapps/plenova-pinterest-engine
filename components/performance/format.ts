/** How the Performances page writes its numbers and days (fr-FR, EUR, UTC days). */

export const eur0 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
export const eur2 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const int = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export const money = (n: number | null) =>
  n === null ? "-" : Math.abs(n) >= 100 ? eur0.format(n) : eur2.format(n);
export const count = (n: number | null) => (n === null ? "-" : int.format(n));
/** A share (0.123) as "12,3 %". */
export const pct = (n: number | null, digits = 1) =>
  n === null
    ? "-"
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n * 100)} %`;
/** A chart value already in percent (12.3) as "12,3 %". */
export const percent = (v: number) => `${dec1.format(v)} %`;
/** Counts averaged over a week keep one decimal: 2,4 a day, not 2. */
export const perDay = (v: number) => dec1.format(v);

export const shortDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
export const longDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
export const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      })
    : "jamais";

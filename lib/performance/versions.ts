/**
 * The app versions the conversion figures count: the owners want them from
 * app 2.0.0 on everywhere (its new onboarding ends on the Home screen and its
 * paywall changed), older versions being another product. Usage and money
 * (active users, revenue, churn, LTV) keep every version.
 * No server import: the page shows this too.
 */
export const MIN_APP_VERSION = "2.0.0";

/** "2.10.0" after "2.9.1": versions compared number by number. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Whether a version label ("2.0.1") is one the conversion figures count. */
export function countedVersion(label: string): boolean {
  const v = label.trim();
  return /^\d+(\.\d+)*$/.test(v) && compareVersions(v, MIN_APP_VERSION) >= 0;
}

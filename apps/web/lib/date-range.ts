/** Date ranges are anchored to the market's latest review date ("as of"), not to today,
 *  so a demo or historical dataset still shows meaningful windows. */
export const RANGES = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "6m", label: "Last 6 months", days: 182 },
  { key: "1y", label: "Last 12 months", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];
export const DEFAULT_RANGE: RangeKey = "6m";

export function parseRange(v: string | string[] | undefined | null, fallback: RangeKey = DEFAULT_RANGE): RangeKey {
  const s = Array.isArray(v) ? v[0] : v;
  return (RANGES.find((r) => r.key === s)?.key ?? fallback) as RangeKey;
}

export type DateWindow = { from: Date; to: Date; key: RangeKey; label: string; days: number | null };

/** [from, to) window ending just after `asOf`. */
export function resolveWindow(key: RangeKey, asOf: Date, earliest?: Date | null): DateWindow {
  const r = RANGES.find((x) => x.key === key) ?? RANGES[3];
  const to = new Date(asOf.getTime() + 1000);
  const from = r.days === null ? (earliest ?? new Date(0)) : new Date(to.getTime() - r.days * 86_400_000);
  return { from, to, key: r.key, label: r.label, days: r.days };
}

const nf0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (n: number) => nf0.format(n);
export const fmt1 = (n: number) => nf1.format(n);
export const fmt2 = (n: number) => nf2.format(n);
export const fmtPct = (fraction: number, digits = 0) => `${(fraction * 100).toFixed(digits)}%`;
export const fmtScore = (n: number | null | undefined) => (n === null || n === undefined ? "—" : nf0.format(Math.round(n)));
export const fmtSigned = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
export const fmtP = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

const dfDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dfMonth = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const dfMonthShort = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const dfShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dfDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export const fmtDate = (d: Date | string) => dfDay.format(new Date(d));
export const fmtMonth = (d: Date | string) => dfMonth.format(new Date(d));
export const fmtMonthShort = (d: Date | string) => dfMonthShort.format(new Date(d));
export const fmtShortDate = (d: Date | string) => dfShort.format(new Date(d));
export const fmtDateTime = (d: Date | string) => `${dfDateTime.format(new Date(d))} UTC`;

export function fmtRelative(d: Date | string, now = new Date()): string {
  const s = Math.round((now.getTime() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

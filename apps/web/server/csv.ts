/**
 * Minimal RFC 4180 CSV parser for review uploads (quoted fields, escaped quotes, CRLF).
 * Required headers: text, rating, date. Optional: app_version. Other columns (e.g. user
 * names) are ignored and never stored.
 */
export function parseCsvRecords(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = input.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export type CsvReview = { text: string; rating: number; reviewedAt: Date; appVersion: string | null; raw: string };

export function parseCsv(input: string, maxRows: number): { rows: CsvReview[]; error?: string } {
  const records = parseCsvRecords(input);
  if (records.length < 2) return { rows: [], error: "The file has no data rows." };
  const header = records[0].map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iText = idx(["text", "content", "review", "review_text"]);
  const iRating = idx(["rating", "score", "stars"]);
  const iDate = idx(["date", "at", "reviewed_at", "review_date"]);
  const iVer = idx(["app_version", "version", "reviewcreatedversion"]);
  if (iText < 0 || iRating < 0 || iDate < 0) return { rows: [], error: "Missing required columns. The header must include text, rating and date." };
  if (records.length - 1 > maxRows) return { rows: [], error: `Too many rows (max ${maxRows}).` };
  const rows: CsvReview[] = [];
  for (let n = 1; n < records.length; n++) {
    const r = records[n];
    const text = (r[iText] ?? "").trim();
    if (!text) continue;
    const rating = Math.round(Number(r[iRating]));
    const date = new Date((r[iDate] ?? "").trim());
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return { rows: [], error: `Row ${n + 1}: rating must be a number from 1 to 5.` };
    if (Number.isNaN(date.getTime())) return { rows: [], error: `Row ${n + 1}: could not read the date (use YYYY-MM-DD).` };
    rows.push({ text: text.slice(0, 5000), rating, reviewedAt: date, appVersion: iVer >= 0 ? r[iVer]?.trim() || null : null, raw: r.join("␟") });
  }
  if (rows.length === 0) return { rows: [], error: "No rows with review text were found." };
  return { rows };
}

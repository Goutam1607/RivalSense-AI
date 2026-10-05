import { describe, expect, it } from "vitest";
import { insightFilterSchema } from "@/server/data/insights";
import { parseReviewFilters } from "@/server/data/reviews";
import { parseCsv, parseCsvRecords } from "@/server/csv";
import { csvCell } from "@/server/api";
import { pdfText } from "@/server/reports/pdf";
import { parseRange, resolveWindow } from "@/lib/date-range";

describe("CSV upload parser", () => {
  it("handles quotes, escaped quotes, CRLF and BOM", () => {
    const rows = parseCsvRecords('﻿text,rating,date\r\n"Late, again",1,2026-01-02\r\n"He said ""wow""",5,2026-01-03\n');
    expect(rows).toEqual([
      ["text", "rating", "date"],
      ["Late, again", "1", "2026-01-02"],
      ['He said "wow"', "5", "2026-01-03"],
    ]);
  });

  it("reads required columns and ignores user names", () => {
    const { rows, error } = parseCsv("userName,content,score,at,version\nalice,Great app,5,2026-01-02,1.2\n", 100);
    expect(error).toBeUndefined();
    expect(rows[0]).toMatchObject({ text: "Great app", rating: 5, appVersion: "1.2" });
    expect(Object.keys(rows[0]).sort()).toEqual(["appVersion", "rating", "raw", "reviewedAt", "text"]); // no name field; raw is only hashed
  });

  it("rejects bad input with a useful message", () => {
    expect(parseCsv("foo,bar\n1,2\n", 100).error).toMatch(/text, rating and date/);
    expect(parseCsv("text,rating,date\nok,9,2026-01-01\n", 100).error).toMatch(/rating/);
    expect(parseCsv("text,rating,date\nok,3,not-a-date\n", 100).error).toMatch(/date/);
    expect(parseCsv("text,rating,date\na,1,2026-01-01\nb,1,2026-01-01\n", 1).error).toMatch(/Too many rows/);
  });
});

describe("URL filter validation", () => {
  it("drops invalid values instead of passing them to SQL", () => {
    const f = parseReviewFilters({ sentiment: "DROP TABLE", rating: "1,9", from: "yesterday", insight: "not-a-uuid", q: "refund", competitor: "kwikr" });
    expect(f).toEqual({ q: "refund", competitor: "kwikr" });
  });
  it("keeps valid values", () => {
    const f = parseReviewFilters({ sentiment: "NEGATIVE", rating: "1,2", from: "2026-01-01", minVersion: "5.2.0" });
    expect(f).toMatchObject({ sentiment: "NEGATIVE", rating: "1,2", from: "2026-01-01", minVersion: "5.2.0" });
  });
  it("insight filters", () => {
    expect(insightFilterSchema.parse({ type: "OPPORTUNITY", confidence: "nope" })).toEqual({ type: "OPPORTUNITY", confidence: undefined, competitor: undefined, aspect: undefined, kind: undefined });
  });
});

describe("exports", () => {
  it("CSV cells are quoted and protected against formula injection", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell(null)).toBe("");
  });
  it("PDF text is sanitised to the built-in font", () => {
    expect(pdfText("₹499 refund ★★ ≥ 30 → done 😡")).toBe("Rs 499 refund stars stars >= 30 -> done");
  });
});

describe("date windows", () => {
  it("are anchored to the data's as-of date", () => {
    const w = resolveWindow(parseRange("30d"), new Date("2026-09-30T12:00:00Z"));
    expect(w.to.toISOString()).toBe("2026-09-30T12:00:01.000Z");
    expect(Math.round((w.to.getTime() - w.from.getTime()) / 86_400_000)).toBe(30);
    expect(parseRange("bogus")).toBe("6m");
  });
});

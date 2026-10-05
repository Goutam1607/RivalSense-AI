"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Star } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ScoreBar } from "@/components/ui/score-bar";
import { NotEnoughData } from "@/components/ui/states";
import { stickyCol, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { competitorColor } from "@/lib/constants";
import { fmt1, fmtInt, fmtScore } from "@/lib/format";
import type { HealthRow } from "@/server/data/analytics";

type Key = "name" | "sentiment" | "rating" | "reviews";

export function HealthTable({ rows, range }: { rows: HealthRow[]; range: string }) {
  const [sort, setSort] = React.useState<{ key: Key; dir: "asc" | "desc" }>({ key: "sentiment", dir: "desc" });
  const sorted = React.useMemo(() => {
    const v = (r: HealthRow): number | string => {
      if (sort.key === "name") return r.competitor.name;
      if (sort.key === "sentiment") return r.sentimentIndex ?? -1;
      if (sort.key === "rating") return r.avgRating ?? -1;
      return r.reviews;
    };
    return [...rows].sort((a, b) => {
      const x = v(a), y = v(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, sort]);

  const header = (key: Key, label: string, numeric = false) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TH numeric={numeric} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
          className="inline-flex items-center gap-1 rounded-sm hover:text-fg"
        >
          {label}
          <Icon className="size-3" aria-hidden />
        </button>
      </TH>
    );
  };

  return (
    <Table>
      <caption className="sr-only">Competitive health per competitor, sortable</caption>
      <THead>
        <tr>
          {header("name", "Competitor")}
          {header("sentiment", "Overall sentiment")}
          {header("rating", "Avg rating", true)}
          <TH>Top strength</TH>
          <TH>Top weakness</TH>
          {header("reviews", "Reviews", true)}
        </tr>
      </THead>
      <TBody>
        {sorted.map((r) => (
          <TR key={r.competitor.id}>
            <TD className={`${stickyCol} font-medium whitespace-nowrap`}>
              <Link href={`/competitors/${r.competitor.slug}?range=${range}`} className="inline-flex items-center gap-2 hover:underline">
                <span className="size-2 rounded-full" style={{ background: competitorColor(r.competitor.colorIndex) }} aria-hidden />
                {r.competitor.name}
              </Link>
            </TD>
            <TD>
              <ScoreBar stats={r.sentiment} />
            </TD>
            <TD numeric>
              {r.avgRating === null ? (
                "—"
              ) : (
                <span className="inline-flex items-center gap-1">
                  {fmt1(r.avgRating)}
                  <Star className="size-3 fill-current text-fg-subtle" aria-label="stars (user rating)" />
                </span>
              )}
            </TD>
            <TD className="whitespace-nowrap">
              {r.topStrength ? (
                <span>
                  {r.topStrength.label} <span className="text-fg-subtle tabular">({fmtScore(r.topStrength.score)})</span>
                </span>
              ) : (
                <NotEnoughData n={r.analysed} />
              )}
            </TD>
            <TD className="whitespace-nowrap">
              {r.topWeakness ? (
                <span>
                  {r.topWeakness.label} <span className="text-fg-subtle tabular">({fmtScore(r.topWeakness.score)})</span>
                </span>
              ) : (
                <span className="text-xs text-fg-subtle">—</span>
              )}
            </TD>
            <TD numeric>
              <span title={`${r.analysed} analysed in English, ${r.otherLanguage} in other languages not yet analysed`}>
                {fmtInt(r.reviews)}
              </span>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

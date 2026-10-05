import type { Metadata } from "next";
import { Suspense } from "react";
import { GroupedBarChart, type Point } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ScoreBar } from "@/components/ui/score-bar";
import { EmptyState, NotEnoughData } from "@/components/ui/states";
import { stickyCol, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CompetitorPicker } from "@/features/compare/competitor-picker";
import { InsightCard } from "@/features/insights/insight-card";
import { competitorColor } from "@/lib/constants";
import { fmt1, fmtDate, fmtInt, fmtScore, fmtSigned } from "@/lib/format";
import { competitiveGap, isMarketWideWeakness, scoreStats, type ScoreStats } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { getMarketContext } from "@/server/context";
import { getAspectMatrix, getAspects, getCompetitors, getCompetitorTotals } from "@/server/data/analytics";
import { listInsights } from "@/server/data/insights";
import { getWindow } from "@/server/data/meta";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const ctx = await getMarketContext();
  const [competitors, aspects, w] = await Promise.all([getCompetitors(ctx), getAspects(ctx), getWindow(ctx, sp.range)]);
  if (!w || competitors.length < 2) {
    return (
      <>
        <PageHeader title="Compare" />
        <Panel>
          <EmptyState title="Need at least two analysed competitors" description="Add competitors and run the analysis pipeline to compare them." />
        </Panel>
      </>
    );
  }
  const requested = typeof sp.c === "string" ? sp.c.split(",").filter((s) => competitors.some((c) => c.slug === s)) : [];
  const selectedSlugs = requested.length >= 2 ? requested.slice(0, 4) : competitors.slice(0, Math.min(4, competitors.length)).map((c) => c.slug);
  const selected = competitors.filter((c) => selectedSlugs.includes(c.slug));
  const [matrix, totals, gapInsights, weakInsights] = await Promise.all([
    getAspectMatrix(ctx, w.from, w.to),
    getCompetitorTotals(ctx, w.from, w.to),
    listInsights(ctx, { kind: "COMPETITIVE_GAP", type: "OBSERVATION" }, 8),
    listInsights(ctx, { kind: "MARKET_WEAKNESS" }, 6),
  ]);
  const stat = (cid: string, aid: string): ScoreStats => matrix.get(`${cid}:${aid}`) ?? scoreStats(0, 0, 0);

  // Side-by-side: each selected competitor vs the median of the other selected ones (§5 gap rule)
  const sideGap = (cid: string, aid: string) => competitiveGap(stat(cid, aid), selected.filter((o) => o.id !== cid).map((o) => stat(o.id, aid)));
  const bars: Point[] = aspects.map((a) => {
    const row: Point = { x: a.key, xLabel: a.label };
    for (const c of selected) {
      const s = stat(c.id, a.id);
      row[c.id] = s.enoughData ? Math.round(s.score!) : null;
      row[`${c.id}__n`] = s.n;
    }
    return row;
  });

  return (
    <>
      <PageHeader
        title="Compare"
        description="Side-by-side aspect scores. A cell is coloured only when the difference from the other selected competitors is meaningful: at least 10 points and non-overlapping intervals."
        meta={<span>{w.label}: {fmtDate(w.from)} – {fmtDate(new Date(w.to.getTime() - 1000))}</span>}
      />
      <div className="mb-5">
        <Suspense>
          <CompetitorPicker competitors={competitors} selected={selectedSlugs} />
        </Suspense>
      </div>
      <div className="grid gap-5">
        <Panel title="Side-by-side" bodyClassName="p-0">
          <Table>
            <caption className="sr-only">Side-by-side comparison of selected competitors</caption>
            <THead>
              <tr>
                <TH>Metric</TH>
                {selected.map((c) => (
                  <TH key={c.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: competitorColor(c.colorIndex) }} aria-hidden />
                      {c.name}
                    </span>
                  </TH>
                ))}
              </tr>
            </THead>
            <TBody>
              <TR>
                <TD className={`${stickyCol} font-medium`}>Average rating (stars)</TD>
                {selected.map((c) => (
                  <TD key={c.id} className="tabular">{totals.get(c.id)?.avgRating ? `${fmt1(totals.get(c.id)!.avgRating!)} ★` : "—"}</TD>
                ))}
              </TR>
              <TR>
                <TD className={`${stickyCol} font-medium`}>Overall sentiment index</TD>
                {selected.map((c) => {
                  const t = totals.get(c.id);
                  return (
                    <TD key={c.id}>
                      <ScoreBar stats={scoreStats(t?.pos ?? 0, t?.neu ?? 0, t?.neg ?? 0)} />
                    </TD>
                  );
                })}
              </TR>
              {aspects.map((a) => (
                <TR key={a.id}>
                  <TD className={`${stickyCol} whitespace-nowrap`}>{a.label}</TD>
                  {selected.map((c) => {
                    const g = sideGap(c.id, a.id);
                    const meaningful = g?.isGap;
                    return (
                      <TD key={c.id} className={cn(meaningful && (g!.difference > 0 ? "bg-positive-bg" : "bg-negative-bg"))}>
                        <span className="flex items-center gap-2">
                          <ScoreBar stats={stat(c.id, a.id)} />
                          {meaningful && (
                            <Badge tone={g!.difference > 0 ? "positive" : "negative"} casing="normal">
                              {fmtSigned(g!.difference)}
                            </Badge>
                          )}
                        </span>
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>

        <Panel title="Aspect scores by competitor" description="Grouped bars (0–100). Missing bars mean fewer than 30 mentions.">
          <GroupedBarChart data={bars} series={selected.map((c) => ({ key: c.id, label: c.name, colorIndex: c.colorIndex }))} yLabel="Aspect score" caption="Aspect scores by competitor" />
        </Panel>

        <Panel
          title="Competitive gap matrix"
          description="All competitors × aspects. Each number is the aspect score; colour marks a §5 competitive gap versus the median of the other competitors. Numbers are always visible."
          bodyClassName="p-0"
        >
          <Table>
            <caption className="sr-only">Competitive gap matrix</caption>
            <THead>
              <tr>
                <TH>Aspect</TH>
                {competitors.map((c) => (
                  <TH key={c.id} numeric>{c.name}</TH>
                ))}
                <TH>Market-wide</TH>
              </tr>
            </THead>
            <TBody>
              {aspects.map((a) => {
                const all = competitors.map((c) => stat(c.id, a.id));
                const weak = isMarketWideWeakness(all.filter((s) => s.enoughData).map((s) => s.score));
                return (
                  <TR key={a.id}>
                    <TD className={`${stickyCol} whitespace-nowrap`}>{a.label}</TD>
                    {competitors.map((c) => {
                      const s = stat(c.id, a.id);
                      const g = competitiveGap(s, competitors.filter((o) => o.id !== c.id).map((o) => stat(o.id, a.id)));
                      return (
                        <TD key={c.id} numeric className={cn(g?.isGap && (g.difference > 0 ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative"), "font-medium")}>
                          {s.enoughData ? (
                            <span title={`n = ${s.n}${g ? `, ${fmtSigned(g.difference)} vs median` : ""}`}>
                              {fmtScore(s.score)}
                              {g?.isGap && <span className="sr-only"> ({g.difference > 0 ? "leads" : "trails"} market by {Math.abs(Math.round(g.difference))} points)</span>}
                            </span>
                          ) : (
                            <NotEnoughData n={s.n} />
                          )}
                        </TD>
                      );
                    })}
                    <TD>{weak ? <Badge tone="warning" casing="normal">Weak for everyone</Badge> : <span className="text-xs text-fg-subtle">—</span>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <p className="border-t border-border px-4 py-2 text-xs text-fg-subtle tabular">
            Based on {fmtInt([...totals.values()].reduce((s, t) => s + t.analysed, 0))} analysed reviews in range.
          </p>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Biggest gaps" description="Competitive-gap observations from the latest analysis run (last 180 days).">
            <div className="grid gap-3">
              {gapInsights.length === 0 ? <EmptyState title="No competitive gaps detected" className="py-6" /> : gapInsights.map((i) => <InsightCard key={i.id} insight={i} compact />)}
            </div>
          </Panel>
          <Panel title="Market-wide weaknesses" description="Aspects where every competitor with enough data scores below 55.">
            <div className="grid gap-3">
              {weakInsights.length === 0 ? <EmptyState title="No market-wide weaknesses detected" className="py-6" /> : weakInsights.map((i) => <InsightCard key={i.id} insight={i} compact />)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

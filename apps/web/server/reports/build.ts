import "server-only";
import type { DateWindow } from "@/lib/date-range";
import { competitiveGap, isMarketWideWeakness, MIN_SAMPLE, rankAspects, scoreStats, sentimentIndex, type ScoreStats } from "@/lib/metrics";
import type { ReportEvidence, ReportFinding, ReportSnapshot, SectionKey } from "@/lib/report-types";
import { getAspectMatrix, getAspects, getCompetitors, getCompetitorTotals, getEmergingIssues, type Ctx } from "@/server/data/analytics";
import { insightText } from "@/server/data/insights";
import { getMarketMeta } from "@/server/data/meta";
import { prisma } from "@/server/db/client";

/** Computes and freezes everything a report shows, so it stays stable after later pipeline runs. */
export async function buildReportSnapshot(ctx: Ctx, opts: { title: string; competitorIds: string[]; window: DateWindow; sections: SectionKey[] }): Promise<ReportSnapshot> {
  const { window: w } = opts;
  const [meta, allCompetitors, aspects, matrix, totals] = await Promise.all([
    getMarketMeta(ctx),
    getCompetitors(ctx),
    getAspects(ctx),
    getAspectMatrix(ctx, w.from, w.to),
    getCompetitorTotals(ctx, w.from, w.to),
  ]);
  const competitors = allCompetitors.filter((c) => opts.competitorIds.includes(c.id));
  const stat = (cid: string, aid: string): ScoreStats => matrix.get(`${cid}:${aid}`) ?? scoreStats(0, 0, 0);

  const scores = competitors.flatMap((c) =>
    aspects.map((a) => {
      const s = stat(c.id, a.id);
      return { competitorId: c.id, aspectKey: a.key, n: s.n, pos: s.pos, neu: s.neu, neg: s.neg, score: s.score, low: s.scoreInterval[0], high: s.scoreInterval[1], confidence: s.confidence };
    }),
  );
  const rankings = competitors.map((c) => {
    const ranked = rankAspects(Object.fromEntries(aspects.map((a) => [a.key, stat(c.id, a.id)])));
    const top = ranked.slice(0, 3).map(([k, s]) => ({ aspectKey: k, score: s.score as number, n: s.n }));
    const bottom = [...ranked].reverse().slice(0, 3).map(([k, s]) => ({ aspectKey: k, score: s.score as number, n: s.n }));
    return { competitorId: c.id, strengths: top.filter((x) => x.score >= 55), weaknesses: bottom.filter((x) => x.score < 55) };
  });
  const gaps = competitors.flatMap((c) =>
    aspects.flatMap((a) => {
      const g = competitiveGap(stat(c.id, a.id), competitors.filter((o) => o.id !== c.id).map((o) => stat(o.id, a.id)));
      return g?.isGap ? [{ competitorId: c.id, aspectKey: a.key, score: stat(c.id, a.id).score as number, median: g.median, difference: g.difference }] : [];
    }),
  );
  gaps.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  const marketWeaknesses = aspects.flatMap((a) => {
    const valid = competitors.map((c) => stat(c.id, a.id)).filter((s) => s.enoughData);
    const sc = valid.map((s) => s.score as number);
    return isMarketWideWeakness(sc) ? [{ aspectKey: a.key, min: Math.min(...sc), max: Math.max(...sc), competitors: valid.length }] : [];
  });

  const issues = (await getEmergingIssues(ctx, meta.latestRun?.id)).filter((i) => opts.competitorIds.includes(i.competitorId));

  // Findings from the latest run (typed insights) for the selected competitors, plus market-level ones
  const insights = meta.latestRun
    ? await prisma.insight.findMany({
        where: {
          marketId: ctx.market.id,
          market: { workspaceId: ctx.workspace.id },
          OR: [{ competitorId: { in: opts.competitorIds } }, { competitorId: null }],
          evidence: { some: {} },
        },
        include: {
          competitor: { select: { name: true } },
          aspectCategory: { select: { label: true } },
          evidence: { take: 2, include: { review: { select: { cleanText: true, text: true, rating: true, reviewedAt: true, competitor: { select: { name: true } } } } } },
        },
        orderBy: { priority: "desc" },
        take: 40,
      })
    : [];
  const evidence: ReportEvidence[] = [];
  const findings: ReportFinding[] = insights.map((i) => {
    const notes = i.evidence.map((e) => {
      evidence.push({
        n: evidence.length + 1,
        competitor: e.review.competitor.name,
        date: e.review.reviewedAt.toISOString(),
        rating: e.review.rating,
        excerpt: (e.review.cleanText ?? e.review.text).slice(0, 220),
      });
      return evidence.length;
    });
    return {
      type: i.type,
      title: i.title,
      text: insightText(i),
      competitor: i.competitor?.name ?? null,
      aspect: i.aspectCategory?.label ?? null,
      n: i.sampleSize,
      confidence: i.confidence,
      footnotes: notes,
    };
  });

  return {
    version: 1,
    title: opts.title,
    market: { name: ctx.market.name, dataKind: ctx.market.dataKind },
    generatedAt: new Date().toISOString(),
    analysisRunId: meta.latestRun?.id ?? null,
    analysisFinishedAt: meta.latestRun?.finishedAt?.toISOString() ?? null,
    window: { from: w.from.toISOString(), to: new Date(w.to.getTime() - 1000).toISOString(), label: w.label },
    sections: opts.sections,
    sources: meta.sources,
    competitors: competitors.map((c) => {
      const t = totals.get(c.id) ?? { reviews: 0, analysed: 0, otherLanguage: 0, avgRating: null, pos: 0, neu: 0, neg: 0 };
      const enough = t.pos + t.neu + t.neg >= MIN_SAMPLE;
      return {
        id: c.id,
        name: c.name,
        colorIndex: c.colorIndex,
        reviews: t.reviews,
        analysed: t.analysed,
        otherLanguage: t.otherLanguage,
        avgRating: t.avgRating,
        sentiment: { pos: t.pos, neu: t.neu, neg: t.neg, index: enough ? sentimentIndex(t.pos, t.neu, t.neg) : null },
      };
    }),
    aspects: aspects.map((a) => ({ key: a.key, label: a.label })),
    scores,
    rankings,
    gaps,
    marketWeaknesses,
    emergingIssues: issues.map((i) => ({
      competitor: i.competitor.name,
      aspect: i.aspectCategory.label,
      kind: i.kind,
      appVersion: i.appVersion,
      prevShare: i.prevShare,
      recentShare: i.recentShare,
      prevNegative: i.prevNegative,
      prevTotal: i.prevTotal,
      recentNegative: i.recentNegative,
      recentTotal: i.recentTotal,
      z: i.zStatistic,
      p: i.pValue,
    })),
    findings,
    evidence,
    methodology: {
      minSample: MIN_SAMPLE,
      models: (meta.latestRun?.models as Record<string, unknown>) ?? {},
      counts: (meta.latestRun?.counts as Record<string, unknown>) ?? {},
      evaluation: (meta.latestRun?.evalSummary as Record<string, unknown>) ?? null,
    },
  };
}

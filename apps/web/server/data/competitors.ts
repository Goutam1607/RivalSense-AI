import "server-only";
import { z } from "zod";
import { competitiveGap, scoreStats, type ScoreStats } from "@/lib/metrics";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { getAspectMatrix, getAspects, getCompetitors, marketScope, type Ctx } from "./analytics";

/** Competitor list with sources, review counts and analysis status. */
export async function listCompetitorsDetailed(ctx: Ctx) {
  const competitors = await prisma.competitor.findMany({
    where: { marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } },
    include: { dataSources: { select: { id: true, kind: true, label: true, externalId: true, lastCollectedAt: true } } },
    orderBy: [{ status: "asc" }, { colorIndex: "asc" }, { name: "asc" }],
  });
  const counts = await prisma.$queryRaw<{ competitor_id: string; total: number; analysed: number; pending: number; last: Date | null }[]>`
    SELECT r.competitor_id::text, COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE r.status = 'ANALYSED')::int AS analysed,
           COUNT(*) FILTER (WHERE r.status = 'PENDING')::int AS pending,
           MAX(r.reviewed_at) AS last
    FROM review r WHERE ${marketScope(ctx, "r")} GROUP BY 1`;
  return competitors.map((c) => {
    const k = counts.find((x) => x.competitor_id === c.id);
    return { ...c, total: k?.total ?? 0, analysed: k?.analysed ?? 0, pending: k?.pending ?? 0, lastReview: k?.last ?? null };
  });
}

export async function getCompetitorBySlug(ctx: Ctx, slug: string) {
  const s = z.string().max(80).parse(slug);
  const c = await prisma.competitor.findFirst({
    where: { slug: s, marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } },
    include: { dataSources: true },
  });
  if (!c) throw new AppError("NOT_FOUND", "Competitor not found in this market.");
  return c;
}

export type AspectProfileRow = {
  key: string;
  label: string;
  stats: ScoreStats;
  shareOfVoice: number;
  marketMedian: number | null;
  gap: ReturnType<typeof competitiveGap>;
  trend: "up" | "down" | "flat" | null; // score now vs previous window of equal length
  prevScore: number | null;
};

/** Per-aspect scores for one competitor in a window, with market comparison and trend direction. */
export async function getAspectProfile(ctx: Ctx, competitorId: string, from: Date, to: Date): Promise<AspectProfileRow[]> {
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);
  const [aspects, competitors, matrix, prev, reviews] = await Promise.all([
    getAspects(ctx),
    getCompetitors(ctx),
    getAspectMatrix(ctx, from, to),
    getAspectMatrix(ctx, prevFrom, from),
    prisma.review.count({ where: { competitorId, marketId: ctx.market.id, status: "ANALYSED", reviewedAt: { gte: from, lt: to } } }),
  ]);
  return aspects.map((a) => {
    const stats = matrix.get(`${competitorId}:${a.id}`) ?? scoreStats(0, 0, 0);
    const others = competitors.filter((c) => c.id !== competitorId).map((c) => matrix.get(`${c.id}:${a.id}`)).filter((s): s is ScoreStats => !!s);
    const gap = competitiveGap(stats, others);
    const p = prev.get(`${competitorId}:${a.id}`);
    const prevScore = p?.enoughData ? p.score : null;
    const trend = stats.score !== null && prevScore !== null ? (stats.score - prevScore >= 5 ? "up" : stats.score - prevScore <= -5 ? "down" : "flat") : null;
    const valid = others.filter((o) => o.enoughData);
    return {
      key: a.key,
      label: a.label,
      stats,
      shareOfVoice: reviews ? stats.n / reviews : 0,
      marketMedian: gap?.median ?? (valid.length ? null : null),
      gap,
      trend,
      prevScore,
    };
  });
}

/** Representative excerpts per aspect: the most confident mentions, newest first, for one competitor. */
export async function getRepresentativeExcerpts(ctx: Ctx, competitorId: string, aspectKey: string, sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL", from: Date, to: Date, take = 3) {
  const rows = await prisma.aspectMention.findMany({
    where: {
      competitorId,
      marketId: ctx.market.id,
      market: { workspaceId: ctx.workspace.id },
      aspectCategory: { key: aspectKey },
      sentiment,
      reviewedAt: { gte: from, lt: to },
      matchStart: { not: null },
    },
    orderBy: [{ confidence: "desc" }, { reviewedAt: "desc" }],
    take,
    include: { review: { select: { id: true, cleanText: true, text: true, rating: true, reviewedAt: true } } },
  });
  return rows.map((m) => ({
    reviewId: m.review.id,
    text: m.review.cleanText ?? m.review.text,
    rating: m.review.rating,
    reviewedAt: m.review.reviewedAt,
    matchStart: m.matchStart,
    matchEnd: m.matchEnd,
    sentiment: m.sentiment,
    confidence: m.confidence,
  }));
}

export async function getSentimentDistribution(ctx: Ctx, competitorId: string, from: Date, to: Date) {
  const rows = await prisma.reviewSentiment.groupBy({
    by: ["label"],
    // competitorId was resolved through the workspace-scoped getCompetitorBySlug
    where: { competitorId, marketId: ctx.market.id, reviewedAt: { gte: from, lt: to } },
    _count: { _all: true },
  });
  const get = (l: string) => (rows.find((r) => r.label === l)?._count as { _all: number } | undefined)?._all ?? 0;
  const ratings = await prisma.review.groupBy({
    by: ["rating"],
    where: { competitorId, marketId: ctx.market.id, status: { notIn: ["DUPLICATE", "SPAM"] }, reviewedAt: { gte: from, lt: to } },
    _count: { _all: true },
  });
  return {
    pos: get("POSITIVE"),
    neu: get("NEUTRAL"),
    neg: get("NEGATIVE"),
    ratings: [1, 2, 3, 4, 5].map((r) => ({ rating: r, n: (ratings.find((x) => x.rating === r)?._count as { _all: number } | undefined)?._all ?? 0 })),
  };
}

/** Monthly aspect scores for one competitor from the pipeline's precomputed aggregates. */
export async function getCompetitorAspectTrend(ctx: Ctx, competitorId: string, from: Date) {
  return prisma.aspectAggregate.findMany({
    where: { competitorId, marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id }, grain: "MONTH", periodStart: { gte: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)) } },
    include: { aspectCategory: { select: { key: true, label: true } } },
    orderBy: { periodStart: "asc" },
  });
}

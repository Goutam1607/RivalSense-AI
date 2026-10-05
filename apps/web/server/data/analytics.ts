import "server-only";
import { cache } from "react";
import type { DateWindow } from "@/lib/date-range";
import { rankAspects, scoreStats, sentimentIndex, shareOfVoice, type ScoreStats } from "@/lib/metrics";
import type { AppContext, MarketSummary } from "@/server/context";
import { prisma } from "@/server/db/client";
import { Prisma } from "@/server/db/generated/client";

export type Ctx = AppContext & { market: MarketSummary };

/**
 * Defence in depth: every raw query re-checks that the market belongs to the caller's workspace,
 * even though ctx.market was already resolved from the user's memberships.
 */
export function marketScope(ctx: Ctx, alias = "x") {
  return Prisma.sql`${Prisma.raw(alias)}.market_id = ${ctx.market.id}::uuid
    AND EXISTS (SELECT 1 FROM market m WHERE m.id = ${ctx.market.id}::uuid AND m.workspace_id = ${ctx.workspace.id}::uuid)`;
}

export type CompetitorRow = { id: string; name: string; slug: string; colorIndex: number; status: "ACTIVE" | "ARCHIVED" };
export type AspectRow = { id: string; key: string; label: string };

export const getCompetitors = cache(async (ctx: Ctx, includeArchived = false): Promise<CompetitorRow[]> => {
  return prisma.competitor.findMany({
    where: { marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id }, ...(includeArchived ? {} : { status: "ACTIVE" }) },
    select: { id: true, name: true, slug: true, colorIndex: true, status: true },
    orderBy: [{ colorIndex: "asc" }, { name: "asc" }],
  });
});

export const getAspects = cache(async (ctx: Ctx): Promise<AspectRow[]> => {
  return prisma.aspectCategory.findMany({
    where: { marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } },
    select: { id: true, key: true, label: true },
    orderBy: { sortOrder: "asc" },
  });
});

type CountRow = { competitor_id: string; aspect_id: string; pos: number; neu: number; neg: number };

/** Mentions per competitor × aspect with sentiment split, for any date window. */
export const getAspectMatrix = cache(async (ctx: Ctx, from: Date, to: Date) => {
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT x.competitor_id::text, x.aspect_category_id::text AS aspect_id,
           COUNT(*) FILTER (WHERE x.sentiment = 'POSITIVE')::int AS pos,
           COUNT(*) FILTER (WHERE x.sentiment = 'NEUTRAL')::int AS neu,
           COUNT(*) FILTER (WHERE x.sentiment = 'NEGATIVE')::int AS neg
    FROM aspect_mention x
    WHERE ${marketScope(ctx)} AND x.reviewed_at >= ${from} AND x.reviewed_at < ${to}
    GROUP BY 1, 2`;
  const stats = new Map<string, ScoreStats>(); // `${competitorId}:${aspectId}`
  for (const r of rows) stats.set(`${r.competitor_id}:${r.aspect_id}`, scoreStats(r.pos, r.neu, r.neg));
  return stats;
});

type SentRow = { competitor_id: string; pos: number; neu: number; neg: number };
type ReviewAgg = { competitor_id: string; reviews: number; analysed: number; avg_rating: number | null; other_language: number };

/** Per-competitor review counts, rating and overall sentiment in a window. */
export const getCompetitorTotals = cache(async (ctx: Ctx, from: Date, to: Date) => {
  const [sent, agg] = await Promise.all([
    prisma.$queryRaw<SentRow[]>`
      SELECT x.competitor_id::text,
             COUNT(*) FILTER (WHERE x.label = 'POSITIVE')::int AS pos,
             COUNT(*) FILTER (WHERE x.label = 'NEUTRAL')::int AS neu,
             COUNT(*) FILTER (WHERE x.label = 'NEGATIVE')::int AS neg
      FROM review_sentiment x
      WHERE ${marketScope(ctx)} AND x.reviewed_at >= ${from} AND x.reviewed_at < ${to}
      GROUP BY 1`,
    prisma.$queryRaw<ReviewAgg[]>`
      SELECT x.competitor_id::text,
             COUNT(*) FILTER (WHERE x.status NOT IN ('DUPLICATE', 'SPAM'))::int AS reviews,
             COUNT(*) FILTER (WHERE x.status = 'ANALYSED')::int AS analysed,
             COUNT(*) FILTER (WHERE x.status = 'NOT_ANALYSED_LANGUAGE')::int AS other_language,
             AVG(x.rating) FILTER (WHERE x.status NOT IN ('DUPLICATE', 'SPAM'))::float AS avg_rating
      FROM review x
      WHERE ${marketScope(ctx)} AND x.reviewed_at >= ${from} AND x.reviewed_at < ${to}
      GROUP BY 1`,
  ]);
  const out = new Map<string, { reviews: number; analysed: number; otherLanguage: number; avgRating: number | null; pos: number; neu: number; neg: number }>();
  for (const a of agg) out.set(a.competitor_id, { reviews: a.reviews, analysed: a.analysed, otherLanguage: a.other_language, avgRating: a.avg_rating, pos: 0, neu: 0, neg: 0 });
  for (const s of sent) {
    const o = out.get(s.competitor_id) ?? { reviews: 0, analysed: 0, otherLanguage: 0, avgRating: null, pos: 0, neu: 0, neg: 0 };
    Object.assign(o, { pos: s.pos, neu: s.neu, neg: s.neg });
    out.set(s.competitor_id, o);
  }
  return out;
});

export type HealthRow = {
  competitor: CompetitorRow;
  reviews: number;
  analysed: number;
  otherLanguage: number;
  avgRating: number | null;
  sentiment: ScoreStats;
  sentimentIndex: number | null;
  topStrength: { label: string; key: string; score: number; n: number } | null;
  topWeakness: { label: string; key: string; score: number; n: number } | null;
};

/** Competitive health table: one row per competitor. */
export async function getHealthTable(ctx: Ctx, w: DateWindow): Promise<HealthRow[]> {
  const [competitors, aspects, matrix, totals] = await Promise.all([
    getCompetitors(ctx),
    getAspects(ctx),
    getAspectMatrix(ctx, w.from, w.to),
    getCompetitorTotals(ctx, w.from, w.to),
  ]);
  return competitors.map((c) => {
    const t = totals.get(c.id) ?? { reviews: 0, analysed: 0, otherLanguage: 0, avgRating: null, pos: 0, neu: 0, neg: 0 };
    const perAspect: Record<string, ScoreStats> = {};
    for (const a of aspects) {
      const s = matrix.get(`${c.id}:${a.id}`);
      if (s) perAspect[a.key] = s;
    }
    const ranked = rankAspects(perAspect);
    const label = (k: string) => aspects.find((a) => a.key === k)?.label ?? k;
    const top = ranked[0];
    const low = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;
    const sentiment = scoreStats(t.pos, t.neu, t.neg);
    return {
      competitor: c,
      reviews: t.reviews,
      analysed: t.analysed,
      otherLanguage: t.otherLanguage,
      avgRating: t.avgRating,
      sentiment,
      sentimentIndex: sentiment.enoughData ? sentimentIndex(t.pos, t.neu, t.neg) : null,
      topStrength: top ? { key: top[0], label: label(top[0]), score: top[1].score as number, n: top[1].n } : null,
      topWeakness: low ? { key: low[0], label: label(low[0]), score: low[1].score as number, n: low[1].n } : null,
    };
  });
}

export type DriverRow = { aspect: AspectRow; mentions: number; pos: number; neu: number; neg: number; shareOfVoice: number; stats: ScoreStats };

/** Top customer drivers: aspects ranked by share of voice across the market. */
export async function getDrivers(ctx: Ctx, w: DateWindow): Promise<{ rows: DriverRow[]; analysedReviews: number }> {
  const [aspects, matrix, totals] = await Promise.all([getAspects(ctx), getAspectMatrix(ctx, w.from, w.to), getCompetitorTotals(ctx, w.from, w.to)]);
  const analysedReviews = [...totals.values()].reduce((s, t) => s + t.analysed, 0);
  const rows = aspects.map((a) => {
    let pos = 0, neu = 0, neg = 0;
    for (const [k, s] of matrix) {
      if (k.endsWith(`:${a.id}`)) {
        pos += s.pos;
        neu += s.neu;
        neg += s.neg;
      }
    }
    const mentions = pos + neu + neg;
    return { aspect: a, mentions, pos, neu, neg, shareOfVoice: shareOfVoice(mentions, analysedReviews), stats: scoreStats(pos, neu, neg) };
  });
  rows.sort((a, b) => b.mentions - a.mentions);
  return { rows, analysedReviews };
}

type TrendRow = { competitor_id: string; period: Date; pos: number; neu: number; neg: number; avg_rating: number | null };

/** Overall sentiment per competitor per period (week for ≤ 90-day windows, otherwise month). */
export async function getSentimentSeries(ctx: Ctx, w: DateWindow) {
  const grain = w.days !== null && w.days <= 90 ? "week" : "month";
  const rows = await prisma.$queryRaw<TrendRow[]>`
    SELECT x.competitor_id::text, date_trunc(${grain}, x.reviewed_at) AS period,
           COUNT(*) FILTER (WHERE x.label = 'POSITIVE')::int AS pos,
           COUNT(*) FILTER (WHERE x.label = 'NEUTRAL')::int AS neu,
           COUNT(*) FILTER (WHERE x.label = 'NEGATIVE')::int AS neg,
           AVG(r.rating)::float AS avg_rating
    FROM review_sentiment x JOIN review r ON r.id = x.review_id
    WHERE ${marketScope(ctx)} AND x.reviewed_at >= ${w.from} AND x.reviewed_at < ${w.to}
    GROUP BY 1, 2 ORDER BY 2`;
  return { grain: grain as "week" | "month", rows };
}

export type IssueRow = Awaited<ReturnType<typeof getEmergingIssues>>[number];

/** Emerging issues + version drops from the latest successful run. */
export async function getEmergingIssues(ctx: Ctx, runId: string | null | undefined) {
  if (!runId) return [];
  return prisma.emergingIssue.findMany({
    where: { analysisRunId: runId, marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } },
    include: { competitor: { select: { name: true, slug: true, colorIndex: true } }, aspectCategory: { select: { key: true, label: true } } },
    orderBy: [{ kind: "asc" }, { zStatistic: "desc" }],
  });
}

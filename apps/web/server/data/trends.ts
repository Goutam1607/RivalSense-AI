import "server-only";
import type { DateWindow } from "@/lib/date-range";
import { prisma } from "@/server/db/client";
import { Prisma } from "@/server/db/generated/client";
import { marketScope, type Ctx } from "./analytics";

export function grainFor(w: DateWindow): "day" | "week" | "month" {
  if (w.days !== null && w.days <= 7) return "day";
  if (w.days !== null && w.days <= 90) return "week";
  return "month";
}

/** Negative mentions per analysed review, per aspect and period (optionally one competitor). */
export async function getComplaintShare(ctx: Ctx, w: DateWindow, competitorId?: string) {
  const grain = grainFor(w);
  const comp = competitorId ? Prisma.sql`AND x.competitor_id = ${competitorId}::uuid` : Prisma.empty;
  const [neg, totals] = await Promise.all([
    prisma.$queryRaw<{ period: Date; aspect_key: string; aspect_label: string; neg: number }[]>`
      SELECT date_trunc(${grain}, x.reviewed_at) AS period, ac.key AS aspect_key, ac.label AS aspect_label, COUNT(*)::int AS neg
      FROM aspect_mention x JOIN aspect_category ac ON ac.id = x.aspect_category_id
      WHERE ${marketScope(ctx)} AND x.sentiment = 'NEGATIVE' AND x.reviewed_at >= ${w.from} AND x.reviewed_at < ${w.to} ${comp}
      GROUP BY 1, 2, 3`,
    prisma.$queryRaw<{ period: Date; n: number }[]>`
      SELECT date_trunc(${grain}, x.reviewed_at) AS period, COUNT(*)::int AS n
      FROM review x
      WHERE ${marketScope(ctx)} AND x.status = 'ANALYSED' AND x.reviewed_at >= ${w.from} AND x.reviewed_at < ${w.to} ${comp}
      GROUP BY 1`,
  ]);
  return { grain, neg, totals };
}

/** Average star rating per competitor and period (all non-duplicate, non-spam reviews). */
export async function getRatingSeries(ctx: Ctx, w: DateWindow) {
  const grain = grainFor(w);
  return {
    grain,
    rows: await prisma.$queryRaw<{ competitor_id: string; period: Date; avg: number; n: number }[]>`
      SELECT x.competitor_id::text, date_trunc(${grain}, x.reviewed_at) AS period, AVG(x.rating)::float AS avg, COUNT(*)::int AS n
      FROM review x
      WHERE ${marketScope(ctx)} AND x.status NOT IN ('DUPLICATE', 'SPAM') AND x.reviewed_at >= ${w.from} AND x.reviewed_at < ${w.to}
      GROUP BY 1, 2 ORDER BY 2`,
  };
}

/** Sentiment index per competitor and period at the trends grain. */
export async function getSentimentByGrain(ctx: Ctx, w: DateWindow) {
  const grain = grainFor(w);
  return {
    grain,
    rows: await prisma.$queryRaw<{ competitor_id: string; period: Date; pos: number; neu: number; neg: number }[]>`
      SELECT x.competitor_id::text, date_trunc(${grain}, x.reviewed_at) AS period,
             COUNT(*) FILTER (WHERE x.label = 'POSITIVE')::int AS pos,
             COUNT(*) FILTER (WHERE x.label = 'NEUTRAL')::int AS neu,
             COUNT(*) FILTER (WHERE x.label = 'NEGATIVE')::int AS neg
      FROM review_sentiment x
      WHERE ${marketScope(ctx)} AND x.reviewed_at >= ${w.from} AND x.reviewed_at < ${w.to}
      GROUP BY 1, 2 ORDER BY 2`,
  };
}

export async function getTopics(ctx: Ctx) {
  return prisma.topic.findMany({
    where: { marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } },
    orderBy: { size: "desc" },
  });
}

/** Clause counts per discovered topic per period. */
export async function getTopicSeries(ctx: Ctx, w: DateWindow, topicIds: string[]) {
  if (topicIds.length === 0) return [];
  const grain = grainFor(w);
  return prisma.$queryRaw<{ topic_id: string; period: Date; n: number }[]>`
    SELECT ta.topic_id::text, date_trunc(${grain}, ta.reviewed_at) AS period, COUNT(*)::int AS n
    FROM topic_assignment ta JOIN topic t ON t.id = ta.topic_id
    WHERE t.market_id = ${ctx.market.id}::uuid
      AND EXISTS (SELECT 1 FROM market m WHERE m.id = t.market_id AND m.workspace_id = ${ctx.workspace.id}::uuid)
      AND ta.topic_id = ANY(${topicIds}::uuid[]) AND ta.reviewed_at >= ${w.from} AND ta.reviewed_at < ${w.to}
    GROUP BY 1, 2 ORDER BY 2`;
}

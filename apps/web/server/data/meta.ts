import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { parseRange, resolveWindow, type DateWindow } from "@/lib/date-range";
import type { AppContext, MarketSummary } from "@/server/context";
import { prisma } from "@/server/db/client";

type Ctx = AppContext & { market: MarketSummary };

export type MarketMeta = {
  asOf: Date | null;
  earliest: Date | null;
  reviewCount: number;
  competitorCount: number;
  sources: string[];
  latestRun: {
    id: string;
    finishedAt: Date | null;
    startedAt: Date;
    provider: string;
    models: unknown;
    counts: unknown;
    evalSummary: unknown;
  } | null;
  runningRun: { id: string; startedAt: Date } | null;
};

/** Facts about the active market used by headers, the footer and every date window. */
export const getMarketMeta = cache(async (ctx: Ctx): Promise<MarketMeta> => {
  const marketId = ctx.market.id;
  const [range, competitorCount, sourceRows, latestRun, runningRun] = await Promise.all([
    prisma.review.aggregate({
      where: { marketId, market: { workspaceId: ctx.workspace.id } },
      _min: { reviewedAt: true },
      _max: { reviewedAt: true },
      _count: { _all: true },
    }),
    prisma.competitor.count({ where: { marketId, status: "ACTIVE", market: { workspaceId: ctx.workspace.id } } }),
    prisma.dataSource.findMany({
      where: { competitor: { marketId, market: { workspaceId: ctx.workspace.id } } },
      select: { label: true },
      distinct: ["label"],
    }),
    prisma.analysisRun.findFirst({
      where: { marketId, status: "SUCCEEDED", market: { workspaceId: ctx.workspace.id } },
      orderBy: { finishedAt: "desc" },
      select: { id: true, finishedAt: true, startedAt: true, provider: true, models: true, counts: true, evalSummary: true },
    }),
    prisma.analysisRun.findFirst({
      where: { marketId, status: "RUNNING", market: { workspaceId: ctx.workspace.id } },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true },
    }),
  ]);
  return {
    asOf: range._max.reviewedAt,
    earliest: range._min.reviewedAt,
    reviewCount: range._count._all,
    competitorCount,
    sources: sourceRows.map((s) => s.label),
    latestRun,
    runningRun,
  };
});

/** Resolve ?range= (falling back to the remembered cookie) into a concrete window. */
export async function getWindow(ctx: Ctx, rangeParam: string | string[] | undefined, fallback?: Parameters<typeof parseRange>[1]): Promise<DateWindow | null> {
  const meta = await getMarketMeta(ctx);
  if (!meta.asOf) return null;
  const remembered = (await cookies()).get("rs_range")?.value;
  const key = parseRange(rangeParam ?? remembered, fallback);
  return resolveWindow(key, meta.asOf, meta.earliest);
}

export type Notification = {
  id: string;
  kind: "TIME_WINDOW" | "APP_VERSION";
  competitor: string;
  competitorSlug: string;
  aspect: string;
  aspectKey: string;
  appVersion: string | null;
  recentShare: number;
  prevShare: number;
  pValue: number;
  detectedAt: Date;
};

/** New emerging issues from the latest successful analysis run. */
export const getNotifications = cache(async (ctx: Ctx): Promise<Notification[]> => {
  const meta = await getMarketMeta(ctx);
  if (!meta.latestRun) return [];
  const rows = await prisma.emergingIssue.findMany({
    where: { analysisRunId: meta.latestRun.id, marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } },
    include: { competitor: { select: { name: true, slug: true } }, aspectCategory: { select: { label: true, key: true } } },
    orderBy: { zStatistic: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    competitor: r.competitor.name,
    competitorSlug: r.competitor.slug,
    aspect: r.aspectCategory.label,
    aspectKey: r.aspectCategory.key,
    appVersion: r.appVersion,
    recentShare: r.recentShare,
    prevShare: r.prevShare,
    pValue: r.pValue,
    detectedAt: r.detectedAt,
  }));
});

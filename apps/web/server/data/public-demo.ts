import "server-only";
import { resolveWindow } from "@/lib/date-range";
import { prisma } from "@/server/db/client";
import { getDrivers, getHealthTable, type Ctx } from "./analytics";
import { insightText } from "./insights";

/**
 * Read-only data for the public landing page preview. Only the synthetic demo market is ever
 * exposed this way (fictional companies), never a user's workspace.
 */
export async function getPublicDemoPreview() {
  try {
    const ws = await prisma.workspace.findUnique({ where: { slug: "demo" } });
    if (!ws?.isDemo) return null;
    const market = await prisma.market.findFirst({ where: { workspaceId: ws.id, dataKind: "DEMO_SYNTHETIC" }, orderBy: { createdAt: "asc" } });
    if (!market) return null;
    const ctx = {
      user: { id: "public", name: "Public", email: "" },
      workspace: { id: ws.id, name: ws.name, slug: ws.slug, isDemo: true, role: "MEMBER" as const },
      workspaces: [],
      market: { id: market.id, name: market.name, slug: market.slug, dataKind: market.dataKind },
      markets: [],
      readOnly: true,
      readOnlyReason: null,
    } satisfies Ctx;
    const [range, run] = await Promise.all([
      prisma.review.aggregate({ where: { marketId: market.id }, _max: { reviewedAt: true }, _count: { _all: true } }),
      prisma.analysisRun.findFirst({ where: { marketId: market.id, status: "SUCCEEDED" }, orderBy: { finishedAt: "desc" } }),
    ]);
    if (!range._max.reviewedAt || !run) return null;
    const w = resolveWindow("6m", range._max.reviewedAt);
    const [health, drivers, excerpt, emerging] = await Promise.all([
      getHealthTable(ctx, w),
      getDrivers(ctx, w),
      prisma.insight.findMany({ where: { marketId: market.id, type: { in: ["OBSERVATION", "OPPORTUNITY"] } }, orderBy: { priority: "desc" }, take: 4 }),
      prisma.emergingIssue.findFirst({ where: { marketId: market.id, kind: "TIME_WINDOW" }, include: { competitor: true, aspectCategory: true }, orderBy: { zStatistic: "desc" } }),
    ]);
    return {
      marketName: market.name,
      reviewCount: range._count._all,
      windowLabel: w.label,
      health,
      drivers: drivers.rows.slice(0, 6),
      findings: excerpt.map((i) => ({ type: i.type, title: i.title, text: insightText(i), n: i.sampleSize, confidence: i.confidence })),
      emerging: emerging
        ? { competitor: emerging.competitor.name, aspect: emerging.aspectCategory.label, prev: emerging.prevShare, recent: emerging.recentShare, p: emerging.pValue }
        : null,
      evaluation: (run.evalSummary as Record<string, Record<string, number>> | null) ?? null,
      counts: (run.counts as Record<string, number>) ?? {},
    };
  } catch {
    return null; // landing page must render even without a database
  }
}

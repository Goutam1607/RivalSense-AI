import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/server/db/generated/client";
import type { Ctx } from "./analytics";

export const insightFilterSchema = z.object({
  type: z.enum(["OBSERVATION", "INTERPRETATION", "OPPORTUNITY", "RECOMMENDATION"]).optional().catch(undefined),
  competitor: z.string().max(80).optional().catch(undefined),
  aspect: z.string().max(80).optional().catch(undefined),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().catch(undefined),
  kind: z
    .enum(["EMERGING_ISSUE", "VERSION_DROP", "COMPETITIVE_GAP", "MARKET_WEAKNESS", "STRENGTH", "WEAKNESS", "TOPIC"])
    .optional()
    .catch(undefined),
});
export type InsightFilters = z.infer<typeof insightFilterSchema>;

const include = {
  competitor: { select: { name: true, slug: true, colorIndex: true } },
  aspectCategory: { select: { key: true, label: true } },
  _count: { select: { evidence: true } },
} satisfies Prisma.InsightInclude;

export type InsightRow = Prisma.InsightGetPayload<{ include: typeof include }>;

/** Insights for the active market. Every insight row is guaranteed to have evidence (pipeline + filter). */
export async function listInsights(ctx: Ctx, filters: InsightFilters = {}, limit = 200): Promise<InsightRow[]> {
  return prisma.insight.findMany({
    where: {
      marketId: ctx.market.id,
      market: { workspaceId: ctx.workspace.id },
      type: filters.type,
      kind: filters.kind,
      confidence: filters.confidence,
      competitor: filters.competitor ? { slug: filters.competitor } : undefined,
      aspectCategory: filters.aspect ? { key: filters.aspect } : undefined,
      evidence: { some: {} },
    },
    include,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
  });
}

export async function getInsightEvidence(ctx: Ctx, insightId: string, take = 5) {
  const id = z.string().uuid().parse(insightId);
  return prisma.insightEvidence.findMany({
    where: { insightId: id, insight: { marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } } },
    include: { review: { select: { id: true, cleanText: true, text: true, rating: true, reviewedAt: true, competitor: { select: { name: true } } } } },
    take,
    orderBy: { review: { reviewedAt: "desc" } },
  });
}

/** Which text to show for an insight: the validated LLM rewrite when present, otherwise the template. */
export function insightText(i: { statement: string; rewrittenStatement: string | null }) {
  return i.rewrittenStatement ?? i.statement;
}

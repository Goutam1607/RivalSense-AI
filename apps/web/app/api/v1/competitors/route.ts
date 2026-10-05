import { withMarket } from "@/server/api";
import { listCompetitorsDetailed } from "@/server/data/competitors";

/** GET /api/v1/competitors — competitors in the active market with sources and review counts. */
export async function GET() {
  return withMarket(async (ctx) => {
    const rows = await listCompetitorsDetailed(ctx);
    return {
      competitors: rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        status: c.status,
        reviews: c.total,
        analysed: c.analysed,
        pending: c.pending,
        latestReview: c.lastReview,
        dataSources: c.dataSources.map((d) => ({ kind: d.kind, label: d.label, externalId: d.externalId, lastCollectedAt: d.lastCollectedAt })),
      })),
    };
  });
}

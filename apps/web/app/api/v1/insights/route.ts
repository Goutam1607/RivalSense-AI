import { searchParamsObject, withMarket } from "@/server/api";
import { insightFilterSchema, insightText, listInsights } from "@/server/data/insights";

/** GET /api/v1/insights?type=&competitor=&aspect=&confidence= — typed insights with evidence counts. */
export async function GET(request: Request) {
  return withMarket(async (ctx) => {
    const filters = insightFilterSchema.parse(searchParamsObject(request.url));
    const rows = await listInsights(ctx, filters);
    return {
      insights: rows.map((i) => ({
        id: i.id,
        type: i.type,
        kind: i.kind,
        title: i.title,
        text: insightText(i),
        writtenBy: i.writtenBy,
        competitor: i.competitor?.slug ?? null,
        aspect: i.aspectCategory?.key ?? null,
        sampleSize: i.sampleSize,
        dateFrom: i.dateFrom,
        dateTo: i.dateTo,
        sources: i.sources,
        confidence: i.confidence,
        impact: i.impact,
        evidenceCount: i._count.evidence,
        suggestion: i.type !== "OBSERVATION",
      })),
    };
  });
}

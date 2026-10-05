import { searchParamsObject, withMarket } from "@/server/api";
import { listReviews, parseReviewFilters } from "@/server/data/reviews";

/** GET /api/v1/reviews — filtered, cursor-paginated reviews (same filters as the review explorer). */
export async function GET(request: Request) {
  return withMarket(async (ctx) => {
    const filters = parseReviewFilters(searchParamsObject(request.url));
    const r = await listReviews(ctx, filters);
    return {
      total: r.total,
      nextCursor: r.nextCursor,
      items: r.items.map((x) => ({
        id: x.id,
        competitor: x.competitor_slug,
        rating: x.rating,
        reviewedAt: x.reviewed_at,
        appVersion: x.app_version,
        language: x.language,
        status: x.status,
        source: x.source_kind,
        sentiment: x.sentiment,
        text: x.text,
        aspects: x.mentions.map((m) => ({ aspect: m.aspectKey, sentiment: m.sentiment, confidence: m.confidence, layer: m.layer, matchStart: m.matchStart, matchEnd: m.matchEnd })),
      })),
    };
  });
}

import { searchParamsObject, withMarket } from "@/server/api";
import { getCompetitors } from "@/server/data/analytics";
import { getWindow } from "@/server/data/meta";
import { getComplaintShare, getSentimentByGrain } from "@/server/data/trends";

/** GET /api/v1/trends?range=90d&competitor=slug — sentiment per competitor and complaint counts per aspect over time. */
export async function GET(request: Request) {
  return withMarket(async (ctx) => {
    const { range, competitor } = searchParamsObject(request.url);
    const w = await getWindow(ctx, range, "90d");
    if (!w) return { window: null, sentiment: [], complaints: [] };
    const comps = await getCompetitors(ctx);
    const focus = comps.find((c) => c.slug === competitor);
    const [sentiment, complaints] = await Promise.all([getSentimentByGrain(ctx, w), getComplaintShare(ctx, w, focus?.id)]);
    const slug = new Map(comps.map((c) => [c.id, c.slug]));
    return {
      window: { from: w.from, to: w.to, label: w.label, grain: sentiment.grain },
      sentiment: sentiment.rows.map((r) => ({ competitor: slug.get(r.competitor_id), period: r.period, positive: r.pos, neutral: r.neu, negative: r.neg })),
      complaints: {
        competitor: focus?.slug ?? null,
        analysedReviews: complaints.totals.map((t) => ({ period: t.period, n: t.n })),
        negativeMentions: complaints.neg.map((n) => ({ period: n.period, aspect: n.aspect_key, n: n.neg })),
      },
    };
  });
}

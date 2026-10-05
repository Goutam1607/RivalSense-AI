import { searchParamsObject, withMarket } from "@/server/api";
import { getDrivers, getEmergingIssues, getHealthTable } from "@/server/data/analytics";
import { getMarketMeta, getWindow } from "@/server/data/meta";

/** GET /api/v1/dashboard?range=6m — competitive health, drivers and emerging issues for the active market. */
export async function GET(request: Request) {
  return withMarket(async (ctx) => {
    const { range } = searchParamsObject(request.url);
    const [meta, w] = await Promise.all([getMarketMeta(ctx), getWindow(ctx, range)]);
    if (!w) return { market: ctx.market, window: null, health: [], drivers: [], emergingIssues: [] };
    const [health, drivers, issues] = await Promise.all([getHealthTable(ctx, w), getDrivers(ctx, w), getEmergingIssues(ctx, meta.latestRun?.id)]);
    return {
      market: ctx.market,
      window: { from: w.from, to: w.to, label: w.label },
      analysisRun: meta.latestRun ? { id: meta.latestRun.id, finishedAt: meta.latestRun.finishedAt } : null,
      health: health.map((h) => ({
        competitor: h.competitor.name,
        slug: h.competitor.slug,
        reviews: h.reviews,
        analysed: h.analysed,
        avgRating: h.avgRating,
        sentimentIndex: h.sentimentIndex,
        topStrength: h.topStrength,
        topWeakness: h.topWeakness,
      })),
      drivers: drivers.rows.map((d) => ({ aspect: d.aspect.key, label: d.aspect.label, mentions: d.mentions, positive: d.pos, neutral: d.neu, negative: d.neg, shareOfVoice: d.shareOfVoice })),
      emergingIssues: issues.map((i) => ({
        competitor: i.competitor.slug,
        aspect: i.aspectCategory.key,
        kind: i.kind,
        appVersion: i.appVersion,
        prevShare: i.prevShare,
        recentShare: i.recentShare,
        zStatistic: i.zStatistic,
        pValue: i.pValue,
      })),
    };
  });
}

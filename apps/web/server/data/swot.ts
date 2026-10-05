import "server-only";
import type { DateWindow } from "@/lib/date-range";
import { competitiveGap, isMarketWideWeakness, type ScoreStats } from "@/lib/metrics";
import { qs } from "@/lib/utils";
import { getAspectMatrix, getAspects, getCompetitors, getEmergingIssues, type Ctx } from "./analytics";
import { getMarketMeta } from "./meta";

export type SwotItem = { title: string; detail: string; n: number; evidenceHref: string; confidence: ScoreStats["confidence"] };
export type Swot = { strengths: SwotItem[]; weaknesses: SwotItem[]; opportunities: SwotItem[]; threats: SwotItem[] };

const fmt = (x: number) => Math.round(x).toString();

/**
 * Evidence-based SWOT for one competitor, built only from computed findings (CLAUDE.md §5):
 *  S — aspects scoring ≥ 60 (enough data) and aspects where it leads the market (gap rule)
 *  W — aspects scoring < 50 and aspects where it trails the market
 *  O — rivals' weaknesses where this competitor is not weak, and market-wide weaknesses
 *  T — rivals' strengths where they lead and this competitor does not, and its own emerging issues
 */
export async function buildSwot(ctx: Ctx, competitorId: string, w: DateWindow): Promise<Swot> {
  const [aspects, competitors, matrix, meta] = await Promise.all([getAspects(ctx), getCompetitors(ctx), getAspectMatrix(ctx, w.from, w.to), getMarketMeta(ctx)]);
  const issues = await getEmergingIssues(ctx, meta.latestRun?.id);
  const me = competitors.find((c) => c.id === competitorId);
  const swot: Swot = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
  if (!me) return swot;
  const from = w.from.toISOString().slice(0, 10);
  const href = (slug: string | undefined, aspect: string, s: string) => `/reviews${qs({ competitor: slug, aspect, aspectSentiment: s, from })}`;
  const stat = (cid: string, aid: string) => matrix.get(`${cid}:${aid}`);

  for (const a of aspects) {
    const mine = stat(me.id, a.id);
    const othersStats = competitors.filter((c) => c.id !== me.id).map((c) => ({ c, s: stat(c.id, a.id) })).filter((x): x is { c: typeof x.c; s: ScoreStats } => !!x.s);
    const gap = mine ? competitiveGap(mine, othersStats.map((o) => o.s)) : null;
    if (mine?.enoughData && mine.score !== null) {
      if (gap?.isGap && gap.difference > 0) {
        swot.strengths.push({ title: `${a.label}: leads the market`, detail: `Score ${fmt(mine.score)} vs median ${fmt(gap.median)} of rivals (+${fmt(gap.difference)} points).`, n: mine.n, evidenceHref: href(me.slug, a.key, "POSITIVE"), confidence: mine.confidence });
      } else if (mine.score >= 60) {
        swot.strengths.push({ title: `${a.label}`, detail: `Score ${fmt(mine.score)} — customers are mostly positive.`, n: mine.n, evidenceHref: href(me.slug, a.key, "POSITIVE"), confidence: mine.confidence });
      }
      if (gap?.isGap && gap.difference < 0) {
        swot.weaknesses.push({ title: `${a.label}: trails the market`, detail: `Score ${fmt(mine.score)} vs median ${fmt(gap.median)} of rivals (${fmt(gap.difference)} points).`, n: mine.n, evidenceHref: href(me.slug, a.key, "NEGATIVE"), confidence: mine.confidence });
      } else if (mine.score < 50) {
        swot.weaknesses.push({ title: `${a.label}`, detail: `Score ${fmt(mine.score)} — more negative than positive mentions.`, n: mine.n, evidenceHref: href(me.slug, a.key, "NEGATIVE"), confidence: mine.confidence });
      }
    }
    // Market-wide weakness → opportunity for everyone
    const all = competitors.map((c) => stat(c.id, a.id)).filter((s): s is ScoreStats => !!s && s.enoughData);
    if (isMarketWideWeakness(all.map((s) => s.score))) {
      swot.opportunities.push({
        title: `${a.label} is weak across the market`,
        detail: `All ${all.length} competitors with enough data score below 55 — no one serves it well yet.`,
        n: all.reduce((s, x) => s + x.n, 0),
        evidenceHref: href(undefined, a.key, "NEGATIVE"),
        confidence: all.map((s) => s.confidence).sort((x, y) => (x === "LOW" ? -1 : y === "LOW" ? 1 : 0))[0] ?? null,
      });
    }
    for (const { c, s } of othersStats) {
      if (!s.enoughData || s.score === null) continue;
      const rivalGap = competitiveGap(s, competitors.filter((o) => o.id !== c.id).map((o) => stat(o.id, a.id)).filter((x): x is ScoreStats => !!x));
      const meOk = mine?.enoughData && mine.score !== null && mine.score >= 50;
      if (rivalGap?.isGap && rivalGap.difference < 0 && meOk) {
        swot.opportunities.push({ title: `${c.name} trails on ${a.label.toLowerCase()}`, detail: `${c.name} scores ${fmt(s.score)}; ${me.name} scores ${fmt(mine!.score!)} — a chance to win dissatisfied customers.`, n: s.n, evidenceHref: href(c.slug, a.key, "NEGATIVE"), confidence: s.confidence });
      }
      const meLeads = gap?.isGap && gap.difference > 0;
      if (rivalGap?.isGap && rivalGap.difference > 0 && !meLeads) {
        swot.threats.push({ title: `${c.name} leads on ${a.label.toLowerCase()}`, detail: `${c.name} scores ${fmt(s.score)} vs a rival median of ${fmt(rivalGap.median)}${mine?.score != null ? `; ${me.name} scores ${fmt(mine.score)}` : ""}.`, n: s.n, evidenceHref: href(c.slug, a.key, "POSITIVE"), confidence: s.confidence });
      }
    }
  }
  for (const i of issues.filter((x) => x.competitorId === me.id)) {
    swot.threats.push({
      title: `Emerging issue: ${i.aspectCategory.label}`,
      detail: `${i.kind === "APP_VERSION" ? `From app version ${i.appVersion}` : "Last 30 days"}: negative mentions per review rose from ${(i.prevShare * 100).toFixed(1)}% to ${(i.recentShare * 100).toFixed(1)}% (p ${i.pValue < 0.001 ? "< 0.001" : i.pValue.toFixed(3)}).`,
      n: i.recentTotal + i.prevTotal,
      evidenceHref: href(me.slug, i.aspectCategory.key, "NEGATIVE"),
      confidence: i.pValue < 0.001 ? "HIGH" : i.pValue < 0.01 ? "MEDIUM" : "LOW",
    });
  }
  return swot;
}

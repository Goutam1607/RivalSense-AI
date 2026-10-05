/** Pure helpers shared by the HTML report view and the PDF renderer. */
import { DEMO_LABEL } from "@/lib/constants";
import type { ReportSnapshot } from "@/lib/report-types";

export const r0 = (x: number | null | undefined) => (x === null || x === undefined ? "—" : String(Math.round(x)));
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function aspectLabel(s: ReportSnapshot, key: string) {
  return s.aspects.find((a) => a.key === key)?.label ?? key;
}
export function competitorName(s: ReportSnapshot, id: string) {
  return s.competitors.find((c) => c.id === id)?.name ?? "—";
}

export function dataStatement(s: ReportSnapshot) {
  return s.market.dataKind === "DEMO_SYNTHETIC"
    ? `${DEMO_LABEL}. The companies are fictional and the reviews were generated for demonstration; every number was computed from them by the real analysis pipeline. Nothing in this report describes a real company.`
    : `Live data: public customer reviews collected from ${s.sources.join(", ")} with a small, polite volume cap. Only review text, rating, date and app version were stored — never reviewer names or IDs.`;
}

/** Executive-summary bullets: observations only (numbers stated as facts), most important first. */
export function executiveBullets(s: ReportSnapshot) {
  const totalReviews = s.competitors.reduce((a, c) => a + c.reviews, 0);
  const analysed = s.competitors.reduce((a, c) => a + c.analysed, 0);
  const bullets: string[] = [
    `${totalReviews.toLocaleString("en-IN")} reviews of ${s.competitors.length} competitor${s.competitors.length === 1 ? "" : "s"} were in scope (${s.window.label.toLowerCase()}); ${analysed.toLocaleString("en-IN")} English reviews were fully analysed.`,
  ];
  const ranked = [...s.competitors].filter((c) => c.sentiment.index !== null).sort((a, b) => (b.sentiment.index ?? 0) - (a.sentiment.index ?? 0));
  if (ranked.length >= 2) {
    bullets.push(`${ranked[0].name} has the most positive overall sentiment (index ${r0(ranked[0].sentiment.index)} of 100); ${ranked[ranked.length - 1].name} the least (${r0(ranked[ranked.length - 1].sentiment.index)}).`);
  }
  for (const f of s.findings.filter((f) => f.type === "OBSERVATION").slice(0, 4)) bullets.push(f.text);
  return bullets;
}

/** Deterministic conclusion built from computed facts. */
export function conclusion(s: ReportSnapshot) {
  const parts: string[] = [];
  const best = [...s.competitors].filter((c) => c.sentiment.index !== null).sort((a, b) => (b.sentiment.index ?? 0) - (a.sentiment.index ?? 0))[0];
  if (best) parts.push(`On the evidence in this period, ${best.name} holds the strongest customer sentiment in the group.`);
  if (s.marketWeaknesses.length) parts.push(`${s.marketWeaknesses.map((m) => aspectLabel(s, m.aspectKey)).join(" and ")} ${s.marketWeaknesses.length > 1 ? "are" : "is"} weak for every competitor with enough data — the clearest open opportunity in the market.`);
  if (s.gaps.length) {
    const g = s.gaps[0];
    parts.push(`The largest measured gap is ${competitorName(s, g.competitorId)} on ${aspectLabel(s, g.aspectKey).toLowerCase()} (${g.difference > 0 ? "+" : ""}${r0(g.difference)} points versus the median of the others).`);
  }
  if (s.emergingIssues.length) parts.push(`${s.emergingIssues.length} emerging issue${s.emergingIssues.length > 1 ? "s were" : " was"} statistically significant and should be monitored.`);
  parts.push("Interpretations and recommendations in this report are analytical suggestions to investigate, not verified market facts.");
  return parts.join(" ");
}

export function evaluationLines(s: ReportSnapshot): string[] {
  const ev = s.methodology.evaluation as Record<string, Record<string, unknown>> | null;
  const out: string[] = [];
  const gold = ev?.gold as Record<string, number> | undefined;
  if (gold) {
    out.push(`Gold set (hand-labelled real reviews, n = ${gold.n}): aspect detection micro-F1 ${Number(gold.aspect_micro_f1).toFixed(2)}, aspect sentiment accuracy ${Number(gold.aspect_sentiment_accuracy).toFixed(2)}, overall sentiment macro-F1 ${Number(gold.overall_macro_f1).toFixed(2)} (baseline lexicon + VADER: ${Number(gold.baseline_overall_macro_f1).toFixed(2)}).`);
  } else {
    out.push("Gold-set evaluation on hand-labelled real reviews: pending (see docs/EVALUATION.md).");
  }
  const syn = ev?.synthetic_sanity as { micro?: { f1: number; precision: number; recall: number }; aspect_sentiment_accuracy?: number; overall_sentiment_macro_f1?: number } | undefined;
  if (syn?.micro) {
    out.push(`Sanity check against the synthetic generator's labels (optimistic, not a real evaluation): aspect detection F1 ${syn.micro.f1.toFixed(2)} (precision ${syn.micro.precision.toFixed(2)}, recall ${syn.micro.recall.toFixed(2)}), aspect sentiment accuracy ${(syn.aspect_sentiment_accuracy ?? 0).toFixed(2)}, overall sentiment macro-F1 ${(syn.overall_sentiment_macro_f1 ?? 0).toFixed(2)}.`);
  }
  return out;
}

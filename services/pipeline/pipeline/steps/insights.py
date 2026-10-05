"""Step 11 — deterministic insight generation from computed findings.

Every insight is typed (CLAUDE.md §4): only OBSERVATION states numbers as facts.
INTERPRETATION / OPPORTUNITY / RECOMMENDATION are phrased as suggestions and carry no
numbers (the UI adds "Analytical suggestion — not verified market fact"). Every insight
links to the reviews that support it.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from pipeline.config import PARAMS, Params
from pipeline.metrics import ScoreStats, competitive_gap, is_market_wide_weakness, rank_aspects
from pipeline.steps.aggregate import MentionFact
from pipeline.steps.topics import TopicOut
from pipeline.steps.trends import Finding

ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


@dataclass
class InsightOut:
    type: str
    kind: str
    title: str
    statement: str
    facts: dict
    sample_size: int
    date_from: datetime
    date_to: datetime
    confidence: str
    impact: str
    priority: float
    evidence_review_ids: list[str]
    competitor_id: str | None = None
    aspect_key: str | None = None
    suggested_investigation: str | None = None
    parent_id: str | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    rewritten_statement: str | None = None
    written_by: str = "template"


def _pct(x: float) -> str:
    return f"{x * 100:.1f}"


def _p(p: float) -> str:
    """'p < 0.001' or 'p = 0.006' — reads correctly inside a sentence."""
    return "p < 0.001" if p < 0.001 else f"p = {p:.3f}"


def _weaker(*labels: str | None) -> str:
    vals = [l for l in labels if l]
    return max(vals, key=lambda l: ORDER[l]) if vals else "LOW"


class InsightBuilder:
    def __init__(self, competitors: dict[str, str], aspects: dict[str, str], sources: list[str],
                 mentions: list[MentionFact], as_of: datetime, params: Params = PARAMS):
        self.comp = competitors
        self.aspect = aspects
        self.sources = sources
        self.mentions = mentions
        self.as_of = as_of
        self.params = params
        self.window_start = as_of - timedelta(days=params.insight_window_days)
        self.out: list[InsightOut] = []

    # ── helpers ──
    def _label(self, key: str) -> str:
        return self.aspect[key]

    def _lower(self, key: str) -> str:
        return self.aspect[key].lower()

    def _evidence(self, comp: str | None, aspect: str, sentiments: set[str], start: datetime | None = None) -> list[str]:
        start = start or self.window_start
        ms = [m for m in self.mentions if m.aspect_key == aspect and m.sentiment in sentiments
              and start <= m.reviewed_at <= self.as_of and (comp is None or m.competitor_id == comp)]
        ms.sort(key=lambda m: m.reviewed_at, reverse=True)
        return [m.review_id for m in ms[: self.params.evidence_per_insight]]

    def _add(self, ins: InsightOut, children: list[tuple[str, str, str, str | None]] = ()) -> None:
        """children: (type, title, statement, suggested_investigation) — inherit evidence/scope from the parent."""
        if not ins.evidence_review_ids:
            return  # never emit an insight without evidence
        self.out.append(ins)
        for i, (t, title, statement, inv) in enumerate(children):
            self.out.append(InsightOut(
                type=t, kind=ins.kind, title=title, statement=statement, facts=ins.facts,
                sample_size=ins.sample_size, date_from=ins.date_from, date_to=ins.date_to,
                confidence=ins.confidence, impact=ins.impact, priority=ins.priority - 0.1 * (i + 1),
                evidence_review_ids=ins.evidence_review_ids, competitor_id=ins.competitor_id,
                aspect_key=ins.aspect_key, suggested_investigation=inv, parent_id=ins.id,
            ))

    # ── builders ──
    def emerging(self, findings: list[Finding]) -> None:
        w = self.params.emerging_window_days
        for f in findings:
            c, a = self.comp[f.competitor_id], self._lower(f.aspect_key)
            conf = "HIGH" if f.p < 0.001 and f.recent_negative >= 40 else "MEDIUM" if f.p < 0.01 else "LOW"
            impact = "HIGH" if f.recent_share >= 0.15 else "MEDIUM" if f.recent_share >= 0.07 else "LOW"
            facts = {"competitor": c, "aspect": a, "window_days": w, "recent_negative": f.recent_negative,
                     "recent_reviews": f.recent_total, "recent_share_pct": _pct(f.recent_share),
                     "previous_negative": f.prev_negative, "previous_reviews": f.prev_total,
                     "previous_share_pct": _pct(f.prev_share), "z": round(f.z, 2), "p_value": _p(f.p),
                     "relative_increase_pct": f"{f.relative_increase * 100:.0f}"}
            statement = (f"Negative {a} mentions for {c} rose from {facts['previous_share_pct']}% of reviews "
                         f"({f.prev_negative} of {f.prev_total}) in the previous {w} days to {facts['recent_share_pct']}% "
                         f"({f.recent_negative} of {f.recent_total}) in the last {w} days "
                         f"(two-proportion z-test: z = {facts['z']}, {facts['p_value']}).")
            inv = (f"Read the most recent negative {a} reviews for {c} and group them by cause; check whether they "
                   f"cluster around particular dates or app versions.")
            self._add(InsightOut("OBSERVATION", "EMERGING_ISSUE", f"{self._label(f.aspect_key)} complaints rising for {c}",
                                 statement, facts, f.recent_total + f.prev_total, f.prev_start, f.recent_end, conf, impact,
                                 100 + min(f.relative_increase, 5), f.evidence_review_ids, f.competitor_id,
                                 f.aspect_key, inv), [
                ("INTERPRETATION", f"Possible cause behind {c}'s {a} complaints",
                 f"A recent change in how {c} handles {a} — for example a process, policy or capacity change — could "
                 f"explain the rise; the linked reviews should show whether the complaints share a common cause.", inv),
                ("OPPORTUNITY", f"{c} customers are reporting {a} problems",
                 f"Competitors with steadier {a} could appeal to {c} customers who are currently reporting problems, "
                 f"for example by making their own {a} experience more visible.", None),
            ])

    def version_drops(self, findings: list[Finding]) -> None:
        for f in findings:
            c, a, v = self.comp[f.competitor_id], self._lower(f.aspect_key), f.app_version
            conf = "HIGH" if f.p < 0.001 and f.recent_negative >= 40 else "MEDIUM" if f.p < 0.01 else "LOW"
            facts = {"competitor": c, "aspect": a, "app_version": v, "after_negative": f.recent_negative,
                     "after_reviews": f.recent_total, "after_share_pct": _pct(f.recent_share),
                     "before_negative": f.prev_negative, "before_reviews": f.prev_total,
                     "before_share_pct": _pct(f.prev_share), "z": round(f.z, 2), "p_value": _p(f.p)}
            statement = (f"Among {c} reviews written on app version {v} or later, {facts['after_share_pct']}% contain a "
                         f"negative {a} mention ({f.recent_negative} of {f.recent_total}), compared with "
                         f"{facts['before_share_pct']}% ({f.prev_negative} of {f.prev_total}) on earlier versions "
                         f"(z = {facts['z']}, {facts['p_value']}; significant after Benjamini–Hochberg correction "
                         f"across all version comparisons).")
            inv = f"Compare {c} reviews just before and after version {v} for the specific {a} problems mentioned."
            self._add(InsightOut("OBSERVATION", "VERSION_DROP", f"{self._label(f.aspect_key)} complaints jumped for {c} from version {v}",
                                 statement, facts, f.recent_total + f.prev_total, f.prev_start, f.recent_end, conf,
                                 "HIGH" if f.recent_share >= 0.15 else "MEDIUM", 95 + min(f.z, 5),
                                 f.evidence_review_ids, f.competitor_id, f.aspect_key, inv), [
                ("INTERPRETATION", f"The {v} release may have introduced {a} problems",
                 f"The timing suggests that the {v} release of the {c} app introduced problems affecting {a}; this is "
                 f"an inference from review timing, not something {c} has confirmed.", inv),
                ("RECOMMENDATION", f"Track whether {c} fixes the {v} regression",
                 f"Consider monitoring whether a later {c} release fixes these {a} problems and whether complaints "
                 f"return to their earlier level.", None),
            ])

    def gaps_and_rankings(self, stats: dict[tuple[str, str], ScoreStats]) -> None:
        window = self.params.insight_window_days
        comps = sorted({c for c, _ in stats})
        aspects = sorted({a for _, a in stats})
        # competitive gaps
        for a in aspects:
            for c in comps:
                target = stats.get((c, a))
                if not target or not target.enough_data:
                    continue
                others = [stats[(o, a)] for o in comps if o != c and (o, a) in stats]
                gap = competitive_gap(target, others, self.params.gap_min_points)
                if not gap or not gap.is_gap:
                    continue
                name, al = self.comp[c], self._lower(a)
                lead = gap.difference > 0
                facts = {"competitor": name, "aspect": al, "score": round(target.score or 0), "median_others": round(gap.median_score),
                         "difference": f"{gap.difference:+.0f}", "mentions": target.n, "window_days": window,
                         "score_interval": [round(target.score_low), round(target.score_high)],
                         "median_interval": [round(gap.median_low), round(gap.median_high)]}
                statement = (f"{name} scores {facts['score']} on {al} versus a median of {facts['median_others']} for the other "
                             f"competitors ({facts['difference']} points, n = {target.n} mentions, last {window} days); "
                             f"the score intervals do not overlap.")
                impact = "HIGH" if abs(gap.difference) >= 25 else "MEDIUM" if abs(gap.difference) >= 15 else "LOW"
                ev = self._evidence(c, a, {"POSITIVE"} if lead else {"NEGATIVE"})
                if lead:
                    children = [("OPPORTUNITY", f"{self._label(a)} is a differentiator for {name}",
                                 f"{name}'s strength in {al} is a differentiator; competitors may lose customers for whom "
                                 f"{al} matters most unless they close the gap.", None)]
                    title = f"{name} leads the market on {al}"
                else:
                    children = [("OPPORTUNITY", f"Rivals can target {name}'s weaker {al}",
                                 f"{name} customers report weaker {al} than elsewhere in the market — an opening for "
                                 f"rivals that perform better on it.", None),
                                ("RECOMMENDATION", f"Investigate what drives {name}'s {al} gap",
                                 f"Consider reading the linked {name} reviews to identify which specific {al} problems "
                                 f"drive the gap before drawing conclusions.", None)]
                    title = f"{name} trails the market on {al}"
                self._add(InsightOut("OBSERVATION", "COMPETITIVE_GAP", title, statement, facts, target.n,
                                     self.window_start, self.as_of, target.confidence or "LOW", impact,
                                     50 + abs(gap.difference), ev, c, a,
                                     f"Read the linked {name} reviews about {al} and compare them with rivals' reviews."),
                          children)
        # market-wide weaknesses
        for a in aspects:
            row = [stats.get((c, a)) for c in comps]
            valid = [s for s in row if s and s.enough_data]
            if not is_market_wide_weakness([s.score for s in valid], self.params.market_weakness_threshold):
                continue
            al = self._lower(a)
            lo, hi = min(s.score for s in valid), max(s.score for s in valid)  # type: ignore[type-var]
            n = sum(s.n for s in valid)
            facts = {"aspect": al, "competitors": len(valid), "threshold": 55, "min_score": round(lo), "max_score": round(hi),
                     "mentions": n, "window_days": window}
            statement = (f"All {len(valid)} competitors with enough data score below 55 on {al} "
                         f"(scores {round(lo)}–{round(hi)}, {n} mentions, last {window} days).")
            conf = _weaker(*[s.confidence for s in valid])
            self._add(InsightOut("OBSERVATION", "MARKET_WEAKNESS", f"{self._label(a)} is weak across the whole market",
                                 statement, facts, n, self.window_start, self.as_of, conf, "HIGH", 90,
                                 self._evidence(None, a, {"NEGATIVE"}), None, a,
                                 f"Read the linked complaints about {al} and list the most common unmet expectations."), [
                ("OPPORTUNITY", f"No competitor serves {al} well",
                 f"No competitor currently serves {al} well, so a visible improvement here could differentiate any "
                 f"player in this market.", None),
                ("RECOMMENDATION", f"Validate demand for better {al}",
                 f"Consider investigating what customers expect from {al} by reading the linked complaints, and test "
                 f"whether improvements are feasible and noticed by customers.", None),
            ])
        # strengths / weaknesses per competitor (§5 ranking)
        for c in comps:
            ranked = rank_aspects({a: s for (cc, a), s in stats.items() if cc == c})
            if not ranked:
                continue
            name = self.comp[c]
            top_key, top = ranked[0]
            if top.score is not None and top.score >= 60:
                facts = {"competitor": name, "aspect": self._lower(top_key), "score": round(top.score), "mentions": top.n,
                         "confidence": top.confidence, "rank": 1, "ranked_aspects": len(ranked), "window_days": window}
                self._add(InsightOut("OBSERVATION", "STRENGTH", f"Top strength for {name}: {self._lower(top_key)}",
                                     f"{name}'s highest-scoring aspect is {self._lower(top_key)} with a score of "
                                     f"{round(top.score)} (n = {top.n} mentions, {(top.confidence or '').lower()} confidence, "
                                     f"last {window} days).", facts, top.n, self.window_start, self.as_of,
                                     top.confidence or "LOW", "MEDIUM", 20 + top.score / 10,
                                     self._evidence(c, top_key, {"POSITIVE"}), c, top_key))
            low_key, low = ranked[-1]
            if len(ranked) > 1 and low.score is not None and low.score < 50:
                facts = {"competitor": name, "aspect": self._lower(low_key), "score": round(low.score), "mentions": low.n,
                         "confidence": low.confidence, "rank": len(ranked), "ranked_aspects": len(ranked), "window_days": window}
                self._add(InsightOut("OBSERVATION", "WEAKNESS", f"Biggest weakness for {name}: {self._lower(low_key)}",
                                     f"{name}'s lowest-scoring aspect is {self._lower(low_key)} with a score of "
                                     f"{round(low.score)} (n = {low.n} mentions, {(low.confidence or '').lower()} confidence, "
                                     f"last {window} days).", facts, low.n, self.window_start, self.as_of,
                                     low.confidence or "LOW", "MEDIUM", 25 + (50 - low.score) / 10,
                                     self._evidence(c, low_key, {"NEGATIVE"}), c, low_key))

    def topics(self, topics: list[TopicOut], member_review_ids: dict[str, list[str]],
               member_dates: dict[str, tuple[datetime, datetime]]) -> None:
        for t in topics:
            if not t.is_uncategorised:
                continue
            kws = ", ".join(t.keywords[:4])
            ids = list(dict.fromkeys(member_review_ids.get(t.id, [])))[: self.params.evidence_per_insight]
            d0, d1 = member_dates.get(t.id, (self.window_start, self.as_of))
            facts = {"theme": t.label, "keywords": t.keywords[:6], "clauses": t.size}
            self._add(InsightOut("OBSERVATION", "TOPIC", f"Uncategorised complaint theme: {t.label}",
                                 f"{t.size} negative clauses form a recurring theme around “{kws}” that does not map to "
                                 f"any fixed aspect category.", facts, t.size, d0, d1,
                                 "MEDIUM" if t.size >= 40 else "LOW", "LOW", 10 + t.size / 20, ids, None, None,
                                 "Read the example reviews to decide whether this theme deserves its own category."), [
                ("INTERPRETATION", f"“{t.label}” may need its own category",
                 "This theme recurs often enough that it may deserve its own aspect category, so that it can be scored "
                 "and tracked like the others.", None),
            ])

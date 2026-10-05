"""Metric formulas from CLAUDE.md §5. Pure functions, unit-tested with hand-calculated values.

The web app re-implements score/Wilson/confidence in apps/web/lib/metrics.ts for
date-range queries; both are tested against the same expected values.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import median

Z95 = 1.959963984540054


def aspect_score(pos: int, neu: int, neg: int) -> float | None:
    """score = 50 × (1 + (pos − neg) / (pos + neu + neg)); 100 = all positive, 0 = all negative."""
    n = pos + neu + neg
    if n == 0:
        return None
    return 50.0 * (1.0 + (pos - neg) / n)


def wilson_interval(successes: int, n: int, z: float = Z95) -> tuple[float, float]:
    """95% Wilson score interval for a proportion, returned as fractions in [0, 1]."""
    if n == 0:
        return (0.0, 1.0)
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def confidence_label(width_points: float, high: float = 10.0, medium: float = 20.0) -> str:
    """High / Medium / Low from interval width in percentage points (< 10 / 10–20 / > 20)."""
    if width_points < high:
        return "HIGH"
    if width_points <= medium:
        return "MEDIUM"
    return "LOW"


@dataclass(frozen=True)
class ScoreStats:
    pos: int
    neu: int
    neg: int
    score: float | None
    pos_low: float
    pos_high: float
    neg_low: float
    neg_high: float
    confidence: str | None
    enough_data: bool

    @property
    def n(self) -> int:
        return self.pos + self.neu + self.neg

    @property
    def score_low(self) -> float:
        """Conservative score interval from the two Wilson intervals (see METRICS.md)."""
        return 50.0 * (1.0 + self.pos_low - self.neg_high)

    @property
    def score_high(self) -> float:
        return 50.0 * (1.0 + self.pos_high - self.neg_low)


def score_stats(pos: int, neu: int, neg: int, min_sample: int = 30) -> ScoreStats:
    n = pos + neu + neg
    pl, ph = wilson_interval(pos, n)
    nl, nh = wilson_interval(neg, n)
    enough = n >= min_sample
    width = max(ph - pl, nh - nl) * 100
    return ScoreStats(
        pos, neu, neg,
        score=aspect_score(pos, neu, neg) if enough else None,
        pos_low=pl, pos_high=ph, neg_low=nl, neg_high=nh,
        confidence=confidence_label(width) if enough else None,
        enough_data=enough,
    )


def share_of_voice(mentions: int, reviews: int) -> float:
    return mentions / reviews if reviews else 0.0


def two_proportion_z_test(x1: int, n1: int, x2: int, n2: int) -> tuple[float, float]:
    """Pooled two-proportion z-test of p1 vs p2. Returns (z, two-sided p-value).
    z > 0 means the first proportion is higher."""
    if n1 == 0 or n2 == 0:
        return (0.0, 1.0)
    p1, p2 = x1 / n1, x2 / n2
    pooled = (x1 + x2) / (n1 + n2)
    se = math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
    if se == 0:
        return (0.0, 1.0)
    z = (p1 - p2) / se
    p_value = math.erfc(abs(z) / math.sqrt(2))  # two-sided
    return (z, p_value)


def relative_increase(recent: float, previous: float) -> float:
    if previous == 0:
        return math.inf if recent > 0 else 0.0
    return recent / previous - 1.0


def is_emerging_issue(recent_neg: int, recent_total: int, prev_neg: int, prev_total: int,
                      min_negative: int = 20, min_rel: float = 0.25, alpha: float = 0.05) -> tuple[bool, float, float, float]:
    """§5 emerging issue rule. Returns (flag, relative_increase, z, p)."""
    r_share = recent_neg / recent_total if recent_total else 0.0
    p_share = prev_neg / prev_total if prev_total else 0.0
    rel = relative_increase(r_share, p_share)
    z, p = two_proportion_z_test(recent_neg, recent_total, prev_neg, prev_total)
    flag = recent_neg >= min_negative and rel >= min_rel and z > 0 and p < alpha
    return flag, rel, z, p


def intervals_overlap(a_low: float, a_high: float, b_low: float, b_high: float) -> bool:
    return a_low <= b_high and b_low <= a_high


@dataclass(frozen=True)
class GapResult:
    difference: float
    median_score: float
    median_low: float
    median_high: float
    is_gap: bool


def competitive_gap(target: ScoreStats, others: list[ScoreStats], min_points: float = 10.0) -> GapResult | None:
    """§5 competitive gap: target score minus the median score of the other competitors (with enough data).
    Flagged when |difference| ≥ 10 and the target's score interval does not overlap the median interval
    (median of the others' lower bounds, median of their upper bounds)."""
    others = [o for o in others if o.enough_data and o.score is not None]
    if target.score is None or not others:
        return None
    med = median([o.score for o in others])  # type: ignore[misc]
    med_low = median([o.score_low for o in others])
    med_high = median([o.score_high for o in others])
    diff = target.score - med
    overlap = intervals_overlap(target.score_low, target.score_high, med_low, med_high)
    return GapResult(diff, med, med_low, med_high, abs(diff) >= min_points and not overlap)


def is_market_wide_weakness(scores: list[float | None], threshold: float = 55.0, min_competitors: int = 2) -> bool:
    """§5: every competitor with enough data scores below the threshold (needs ≥ 2 such competitors)."""
    valid = [s for s in scores if s is not None]
    return len(valid) >= min_competitors and all(s < threshold for s in valid)


def rank_aspects(stats: dict[str, ScoreStats]) -> list[tuple[str, ScoreStats]]:
    """§5 strength/weakness ranking: by score (desc), ties broken by mention volume (desc). Only enough-data aspects."""
    ranked = [(k, s) for k, s in stats.items() if s.enough_data and s.score is not None]
    ranked.sort(key=lambda kv: (-(kv[1].score or 0.0), -kv[1].n))
    return ranked


def benjamini_hochberg(p_values: list[float], q: float = 0.05) -> list[bool]:
    """Benjamini–Hochberg FDR control. Returns which hypotheses are rejected."""
    m = len(p_values)
    if m == 0:
        return []
    order = sorted(range(m), key=lambda i: p_values[i])
    cutoff = -1
    for rank, i in enumerate(order, start=1):
        if p_values[i] <= q * rank / m:
            cutoff = rank
    rejected = [False] * m
    for rank, i in enumerate(order, start=1):
        if rank <= cutoff:
            rejected[i] = True
    return rejected

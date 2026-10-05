"""Metric formulas from CLAUDE.md §5, checked against hand-calculated values (worked in docs/METRICS.md)."""

import math

import pytest

from pipeline.metrics import (
    aspect_score,
    benjamini_hochberg,
    competitive_gap,
    confidence_label,
    is_emerging_issue,
    is_market_wide_weakness,
    rank_aspects,
    score_stats,
    two_proportion_z_test,
    wilson_interval,
)


def test_aspect_score_formula():
    assert aspect_score(6, 2, 2) == pytest.approx(70.0)  # 50 × (1 + 4/10)
    assert aspect_score(10, 0, 0) == 100.0
    assert aspect_score(0, 0, 10) == 0.0
    assert aspect_score(3, 4, 3) == 50.0
    assert aspect_score(0, 0, 0) is None


def test_wilson_interval_hand_calculated():
    lo, hi = wilson_interval(8, 10)
    assert lo == pytest.approx(0.4902, abs=1e-3)
    assert hi == pytest.approx(0.9433, abs=1e-3)
    lo, hi = wilson_interval(0, 10)
    assert lo == 0.0
    assert hi == pytest.approx(0.2775, abs=1e-3)
    assert wilson_interval(0, 0) == (0.0, 1.0)


def test_confidence_label_thresholds():
    assert confidence_label(9.99) == "HIGH"
    assert confidence_label(10) == "MEDIUM"
    assert confidence_label(20) == "MEDIUM"
    assert confidence_label(20.01) == "LOW"


def test_minimum_sample_rule():
    small = score_stats(20, 5, 4)  # n = 29
    assert not small.enough_data and small.score is None and small.confidence is None
    ok = score_stats(20, 6, 4)  # n = 30
    assert ok.enough_data and ok.score == pytest.approx(50 * (1 + 16 / 30))


def test_two_proportion_z_test_hand_calculated():
    z, p = two_proportion_z_test(30, 100, 15, 100)
    assert z == pytest.approx(2.540, abs=1e-3)  # pooled 0.225, se 0.05906
    assert p == pytest.approx(0.01109, abs=2e-4)
    assert two_proportion_z_test(0, 0, 1, 10) == (0.0, 1.0)


def test_emerging_issue_rules():
    # passes all three rules
    flag, rel, z, p = is_emerging_issue(30, 100, 15, 100)
    assert flag and rel == pytest.approx(1.0) and p < 0.05
    # fewer than 20 recent negative mentions
    assert not is_emerging_issue(19, 50, 5, 50)[0]
    # relative increase below 25%
    assert not is_emerging_issue(240, 1000, 200, 1000)[0]  # +20%
    # not significant
    assert not is_emerging_issue(21, 200, 15, 200)[0]
    # decreases are never flagged
    assert not is_emerging_issue(20, 100, 40, 100)[0]


def test_competitive_gap_rule():
    strong = score_stats(90, 5, 5)  # score 92.5, tight interval
    weak = [score_stats(40, 20, 40), score_stats(45, 10, 45), score_stats(35, 30, 35)]  # all 50
    g = competitive_gap(strong, weak)
    assert g is not None and g.median_score == pytest.approx(50) and g.difference == pytest.approx(42.5) and g.is_gap
    # 10+ points but overlapping intervals (small samples) → not a gap
    a, b = score_stats(20, 5, 7), score_stats(15, 5, 12)
    g2 = competitive_gap(a, [b])
    assert abs(g2.difference) >= 10 and not g2.is_gap
    # target without enough data → no comparison
    assert competitive_gap(score_stats(5, 0, 0), weak) is None


def test_market_wide_weakness():
    assert is_market_wide_weakness([30, 40, 54.9])
    assert not is_market_wide_weakness([30, 40, 55])
    assert not is_market_wide_weakness([30, None, None])  # needs at least 2 competitors with enough data
    assert is_market_wide_weakness([30, None, 50])


def test_rank_aspects_ties_broken_by_volume():
    stats = {"a": score_stats(30, 0, 30), "b": score_stats(60, 0, 60), "c": score_stats(50, 10, 0), "d": score_stats(5, 0, 0)}
    ranked = [k for k, _ in rank_aspects(stats)]
    assert ranked == ["c", "b", "a"]  # c = 91.7; a and b both 50 → b has more mentions; d lacks data


def test_benjamini_hochberg():
    ps = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216]
    rej = benjamini_hochberg(ps, 0.05)
    assert rej[:2] == [True, True] and not any(rej[2:])
    assert benjamini_hochberg([]) == []


def test_score_interval_contains_score():
    s = score_stats(40, 10, 20)
    assert s.score_low <= s.score <= s.score_high
    assert not math.isnan(s.score_low)

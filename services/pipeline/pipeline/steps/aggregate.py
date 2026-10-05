"""Step 9 — aggregation per competitor × aspect × period (week and month), CLAUDE.md §5."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from pipeline.config import PARAMS, Params
from pipeline.metrics import ScoreStats, score_stats, share_of_voice


def month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def next_month(d: date) -> date:
    return date(d.year + (d.month == 12), d.month % 12 + 1, 1)


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())  # ISO week, Monday


@dataclass
class AggregateRow:
    competitor_id: str
    aspect_key: str
    grain: str  # WEEK | MONTH
    period_start: date
    period_end: date  # exclusive
    stats: ScoreStats
    review_count: int
    share_of_voice: float


@dataclass(frozen=True)
class MentionFact:
    review_id: str
    competitor_id: str
    aspect_key: str
    sentiment: str  # POSITIVE | NEUTRAL | NEGATIVE
    reviewed_at: datetime


def compute_aggregates(mentions: list[MentionFact], analysed_reviews: list[tuple[str, datetime]],
                       params: Params = PARAMS) -> list[AggregateRow]:
    """analysed_reviews: (competitor_id, reviewed_at) for every analysed review (the share-of-voice denominator)."""
    review_counts: dict[tuple[str, str, date], int] = defaultdict(int)
    for comp, when in analysed_reviews:
        d = when.date()
        review_counts[(comp, "MONTH", month_start(d))] += 1
        review_counts[(comp, "WEEK", week_start(d))] += 1

    counts: dict[tuple[str, str, str, date], list[int]] = defaultdict(lambda: [0, 0, 0])
    idx = {"POSITIVE": 0, "NEUTRAL": 1, "NEGATIVE": 2}
    for m in mentions:
        d = m.reviewed_at.date()
        counts[(m.competitor_id, m.aspect_key, "MONTH", month_start(d))][idx[m.sentiment]] += 1
        counts[(m.competitor_id, m.aspect_key, "WEEK", week_start(d))][idx[m.sentiment]] += 1

    rows = []
    for (comp, aspect, grain, start), (pos, neu, neg) in sorted(counts.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2], kv[0][3])):
        end = next_month(start) if grain == "MONTH" else start + timedelta(days=7)
        reviews = review_counts.get((comp, grain, start), 0)
        st = score_stats(pos, neu, neg, params.min_sample)
        rows.append(AggregateRow(comp, aspect, grain, start, end, st, reviews, share_of_voice(pos + neu + neg, reviews)))
    return rows


def window_stats(mentions: list[MentionFact], start: datetime, end: datetime, params: Params = PARAMS) -> dict[tuple[str, str], ScoreStats]:
    """Score stats per (competitor, aspect) for mentions with start <= reviewed_at < end."""
    acc: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0, 0])
    idx = {"POSITIVE": 0, "NEUTRAL": 1, "NEGATIVE": 2}
    for m in mentions:
        if start <= m.reviewed_at < end:
            acc[(m.competitor_id, m.aspect_key)][idx[m.sentiment]] += 1
    return {k: score_stats(*v, params.min_sample) for k, v in acc.items()}

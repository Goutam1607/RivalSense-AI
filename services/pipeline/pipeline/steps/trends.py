"""Step 10 — trend + emerging-issue detection (CLAUDE.md §5).

Emerging issue (time window): an aspect whose negative-mention share — negative mentions of
the aspect ÷ analysed reviews of the competitor — is higher in the most recent 30 days than in
the previous 30 days, with ≥ 20 recent negative mentions, ≥ 25% relative increase, and a
two-proportion z-test p < 0.05.

App-version drop (extension): same share compared between reviews on versions ≥ V and
versions < V; Benjamini–Hochberg FDR across all version tests (many versions → many tests).
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from pipeline.config import PARAMS, Params
from pipeline.metrics import benjamini_hochberg, is_emerging_issue, relative_increase, two_proportion_z_test
from pipeline.steps.aggregate import MentionFact


@dataclass
class Finding:
    kind: str  # TIME_WINDOW | APP_VERSION
    competitor_id: str
    aspect_key: str
    recent_start: datetime
    recent_end: datetime
    prev_start: datetime
    prev_end: datetime
    recent_negative: int
    recent_total: int
    prev_negative: int
    prev_total: int
    z: float
    p: float
    app_version: str | None = None
    evidence_review_ids: list[str] = field(default_factory=list)

    @property
    def recent_share(self) -> float:
        return self.recent_negative / self.recent_total if self.recent_total else 0.0

    @property
    def prev_share(self) -> float:
        return self.prev_negative / self.prev_total if self.prev_total else 0.0

    @property
    def relative_increase(self) -> float:
        r = relative_increase(self.recent_share, self.prev_share)
        return r if r != float("inf") else 999.0


@dataclass(frozen=True)
class ReviewFact:
    review_id: str
    competitor_id: str
    reviewed_at: datetime
    app_version: str | None


def detect_emerging_issues(mentions: list[MentionFact], reviews: list[ReviewFact], as_of: datetime,
                           params: Params = PARAMS) -> list[Finding]:
    w = timedelta(days=params.emerging_window_days)
    recent_start, prev_start = as_of - w, as_of - 2 * w
    totals: dict[tuple[str, str], int] = defaultdict(int)  # (competitor, "recent"/"prev") → analysed reviews
    for r in reviews:
        if recent_start < r.reviewed_at <= as_of:
            totals[(r.competitor_id, "recent")] += 1
        elif prev_start < r.reviewed_at <= recent_start:
            totals[(r.competitor_id, "prev")] += 1
    neg: dict[tuple[str, str, str], list[MentionFact]] = defaultdict(list)
    for m in mentions:
        if m.sentiment != "NEGATIVE":
            continue
        if recent_start < m.reviewed_at <= as_of:
            neg[(m.competitor_id, m.aspect_key, "recent")].append(m)
        elif prev_start < m.reviewed_at <= recent_start:
            neg[(m.competitor_id, m.aspect_key, "prev")].append(m)

    findings = []
    pairs = {(c, a) for (c, a, _) in neg}
    for comp, aspect in sorted(pairs):
        rn, rt = len(neg[(comp, aspect, "recent")]), totals[(comp, "recent")]
        pn, pt = len(neg[(comp, aspect, "prev")]), totals[(comp, "prev")]
        flag, _, z, p = is_emerging_issue(rn, rt, pn, pt, params.emerging_min_negative,
                                          params.emerging_min_relative_increase, params.emerging_alpha)
        if flag:
            ev = sorted(neg[(comp, aspect, "recent")], key=lambda m: m.reviewed_at, reverse=True)
            findings.append(Finding("TIME_WINDOW", comp, aspect, recent_start, as_of, prev_start, recent_start,
                                    rn, rt, pn, pt, z, p, None, [m.review_id for m in ev[: params.evidence_per_insight]]))
    return findings


def _vkey(v: str) -> tuple:
    return tuple(int(x) if x.isdigit() else x for x in re.split(r"[.\-_]", v))


def detect_version_drops(mentions: list[MentionFact], reviews: list[ReviewFact], params: Params = PARAMS) -> list[Finding]:
    by_comp_versions: dict[str, set[str]] = defaultdict(set)
    review_version = {}
    for r in reviews:
        if r.app_version:
            by_comp_versions[r.competitor_id].add(r.app_version)
            review_version[r.review_id] = r
    neg_by: dict[tuple[str, str], list[MentionFact]] = defaultdict(list)
    for m in mentions:
        if m.sentiment == "NEGATIVE" and m.review_id in review_version:
            neg_by[(m.competitor_id, m.aspect_key)].append(m)

    candidates: list[Finding] = []
    for (comp, aspect), negs in sorted(neg_by.items()):
        try:
            versions = sorted(by_comp_versions[comp], key=_vkey)
        except TypeError:
            versions = sorted(by_comp_versions[comp])
        comp_reviews = [r for r in review_version.values() if r.competitor_id == comp]
        best: Finding | None = None
        for v in versions[1:]:
            after = [r for r in comp_reviews if _safe_ge(r.app_version, v)]
            before = [r for r in comp_reviews if not _safe_ge(r.app_version, v)]
            if len(after) < params.version_min_reviews or len(before) < params.version_min_reviews:
                continue
            after_ids = {r.review_id for r in after}
            an = sum(1 for m in negs if m.review_id in after_ids)
            bn = len(negs) - an
            z, p = two_proportion_z_test(an, len(after), bn, len(before))
            if z <= 0:
                continue
            f = Finding("APP_VERSION", comp, aspect,
                        min(r.reviewed_at for r in after), max(r.reviewed_at for r in after),
                        min(r.reviewed_at for r in before), max(r.reviewed_at for r in before),
                        an, len(after), bn, len(before), z, p, v,
                        [m.review_id for m in sorted((m for m in negs if m.review_id in after_ids),
                                                     key=lambda m: m.reviewed_at, reverse=True)][: params.evidence_per_insight])
            if best is None or f.z > best.z:
                best = f
        if best is not None:
            candidates.append(best)

    rejected = benjamini_hochberg([f.p for f in candidates], params.version_fdr)
    return [f for f, rej in zip(candidates, rejected)
            if rej and f.recent_negative >= params.version_min_negative
            and f.relative_increase >= params.version_min_relative_increase]


def _safe_ge(a: str | None, b: str) -> bool:
    if a is None:
        return False
    try:
        return _vkey(a) >= _vkey(b)
    except TypeError:
        return a >= b

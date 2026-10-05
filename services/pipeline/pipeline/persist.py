"""Write pipeline output to Postgres.

Re-running never duplicates results: inside one transaction the previous results for the
market are deleted and the new ones inserted, all tagged with the new analysis_run_id.
AnalysisRun rows themselves are kept as history.
"""

from __future__ import annotations

import logging
import uuid

import psycopg

from pipeline.db import copy_rows, jsonb
from pipeline.steps.aggregate import AggregateRow
from pipeline.steps.analyze import AnalysisResult
from pipeline.steps.insights import InsightOut
from pipeline.steps.topics import TopicOut
from pipeline.steps.trends import Finding

log = logging.getLogger("pipeline.persist")


def clear_market_results(conn: psycopg.Connection, market_id: str) -> None:
    for sql in [
        "DELETE FROM insight WHERE market_id = %s",
        "DELETE FROM topic WHERE market_id = %s",
        "DELETE FROM emerging_issue WHERE market_id = %s",
        "DELETE FROM aspect_aggregate WHERE market_id = %s",
        "DELETE FROM aspect_mention WHERE market_id = %s",
        "DELETE FROM review_sentiment WHERE market_id = %s",
        "DELETE FROM review_clause WHERE review_id IN (SELECT id FROM review WHERE market_id = %s)",
    ]:
        conn.execute(sql, (market_id,))


def update_reviews(conn: psycopg.Connection, result: AnalysisResult) -> None:
    conn.execute("""CREATE TEMP TABLE tmp_review_update (id uuid, clean_text text, content_hash text,
                    language text, status text) ON COMMIT DROP""")
    copy_rows(conn, "tmp_review_update", ["id", "clean_text", "content_hash", "language", "status"],
              ((r.id, r.clean_text, r.content_hash, r.language, r.status) for r in result.reviews.values()))
    conn.execute("""UPDATE review r SET clean_text = t.clean_text, content_hash = t.content_hash,
                    language = t.language, status = t.status::"ReviewStatus"
                    FROM tmp_review_update t WHERE r.id = t.id""")


def write_row_results(conn: psycopg.Connection, run_id: str, market_id: str, result: AnalysisResult,
                      reviews_by_id: dict[str, dict], aspect_ids: dict[str, str]) -> dict:
    n_sent = copy_rows(conn, "review_sentiment",
                       ["review_id", "analysis_run_id", "market_id", "competitor_id", "reviewed_at", "label",
                        "confidence", "positive", "neutral", "negative"],
                       ((r.id, run_id, market_id, reviews_by_id[r.id]["competitor_id"], reviews_by_id[r.id]["reviewed_at"],
                         r.sentiment, r.confidence, r.probs[2], r.probs[1], r.probs[0])
                        for r in result.reviews.values() if r.status == "ANALYSED" and r.sentiment))
    n_cl = copy_rows(conn, "review_clause",
                     ["id", "review_id", "analysis_run_id", "position", "text", "char_start", "char_end", "sentiment", "confidence"],
                     ((c.id, c.review_id, run_id, c.position, c.text, c.start, c.end, c.sentiment, c.confidence)
                      for c in result.clauses))
    n_m = copy_rows(conn, "aspect_mention",
                    ["id", "review_id", "clause_id", "analysis_run_id", "aspect_category_id", "market_id", "competitor_id",
                     "reviewed_at", "sentiment", "confidence", "layer", "matched_text", "match_start", "match_end", "similarity"],
                    ((m.id, m.review_id, m.clause_id, run_id, aspect_ids[m.aspect_key], market_id,
                      reviews_by_id[m.review_id]["competitor_id"], reviews_by_id[m.review_id]["reviewed_at"], m.sentiment,
                      m.confidence, m.layer, m.matched_text, m.match_start, m.match_end, m.similarity)
                     for m in result.mentions))
    return {"review_sentiments": n_sent, "clauses": n_cl, "aspect_mentions": n_m}


def write_aggregates(conn: psycopg.Connection, run_id: str, market_id: str, rows: list[AggregateRow],
                     aspect_ids: dict[str, str]) -> int:
    return copy_rows(conn, "aspect_aggregate",
                     ["analysis_run_id", "market_id", "competitor_id", "aspect_category_id", "grain", "period_start",
                      "period_end", "mentions", "positive", "neutral", "negative", "review_count", "score", "pos_low",
                      "pos_high", "neg_low", "neg_high", "confidence", "share_of_voice"],
                     ((run_id, market_id, r.competitor_id, aspect_ids[r.aspect_key], r.grain, r.period_start, r.period_end,
                       r.stats.n, r.stats.pos, r.stats.neu, r.stats.neg, r.review_count, r.stats.score, r.stats.pos_low,
                       r.stats.pos_high, r.stats.neg_low, r.stats.neg_high, r.stats.confidence, r.share_of_voice)
                      for r in rows))


def write_findings(conn: psycopg.Connection, run_id: str, market_id: str, findings: list[Finding],
                   aspect_ids: dict[str, str]) -> int:
    return copy_rows(conn, "emerging_issue",
                     ["analysis_run_id", "market_id", "competitor_id", "aspect_category_id", "kind", "app_version",
                      "recent_start", "recent_end", "prev_start", "prev_end", "recent_negative", "recent_total",
                      "prev_negative", "prev_total", "recent_share", "prev_share", "relative_increase", "z_statistic",
                      "p_value", "evidence_review_ids"],
                     ((run_id, market_id, f.competitor_id, aspect_ids[f.aspect_key], f.kind, f.app_version, f.recent_start,
                       f.recent_end, f.prev_start, f.prev_end, f.recent_negative, f.recent_total, f.prev_negative,
                       f.prev_total, f.recent_share, f.prev_share, f.relative_increase, f.z, f.p, f.evidence_review_ids)
                      for f in findings))


def write_topics(conn: psycopg.Connection, run_id: str, market_id: str, topics: list[TopicOut],
                 assignments: list[tuple[str, str, str | None, str, object]]) -> int:
    copy_rows(conn, "topic",
              ["id", "analysis_run_id", "market_id", "label", "keywords", "size", "is_uncategorised",
               "nearest_aspect_key", "example_review_ids"],
              ((t.id, run_id, market_id, t.label, t.keywords, t.size, t.is_uncategorised, t.nearest_aspect_key,
                t.example_review_ids) for t in topics))
    return copy_rows(conn, "topic_assignment", ["id", "topic_id", "review_id", "clause_id", "competitor_id", "reviewed_at"],
                     ((str(uuid.uuid4()), *a) for a in assignments))


def write_insights(conn: psycopg.Connection, run_id: str, market_id: str, insights: list[InsightOut],
                   aspect_ids: dict[str, str], sources: list[str]) -> int:
    copy_rows(conn, "insight",
              ["id", "analysis_run_id", "market_id", "competitor_id", "aspect_category_id", "parent_id", "type", "kind",
               "title", "statement", "rewritten_statement", "written_by", "facts", "sample_size", "date_from", "date_to",
               "sources", "confidence", "impact", "priority", "suggested_investigation"],
              ((i.id, run_id, market_id, i.competitor_id, aspect_ids.get(i.aspect_key) if i.aspect_key else None,
                i.parent_id, i.type, i.kind, i.title, i.statement, i.rewritten_statement, i.written_by, jsonb(i.facts),
                i.sample_size, i.date_from, i.date_to, sources, i.confidence, i.impact, i.priority,
                i.suggested_investigation) for i in insights))
    return copy_rows(conn, "insight_evidence", ["insight_id", "review_id"],
                     ((i.id, rid) for i in insights for rid in dict.fromkeys(i.evidence_review_ids)))

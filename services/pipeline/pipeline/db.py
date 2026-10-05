"""Database access with psycopg 3 and parameterised SQL.

Prisma (prisma/schema.prisma) owns the schema. CONTRACT lists every table/column the
pipeline touches; tests/test_db_contract.py checks they exist so schema drift fails fast.
"""

from __future__ import annotations

import io
import json
from contextlib import contextmanager
from typing import Iterable, Iterator

import psycopg
from psycopg.rows import dict_row

from pipeline.config import database_url

CONTRACT: dict[str, list[str]] = {
    "workspace": ["id", "name", "slug", "is_demo"],
    "market": ["id", "workspace_id", "name", "slug", "description", "data_kind"],
    "aspect_category": ["id", "market_id", "key", "label", "description", "seed_keywords", "sort_order"],
    "competitor": ["id", "market_id", "name", "slug", "description", "status", "color_index", "updated_at"],
    "data_source": ["id", "competitor_id", "kind", "label", "external_id", "config", "last_collected_at"],
    "review": ["id", "market_id", "competitor_id", "data_source_id", "external_key", "text", "clean_text", "rating",
               "reviewed_at", "app_version", "language", "status", "content_hash", "collected_at"],
    "analysis_run": ["id", "market_id", "status", "provider", "started_at", "finished_at", "models", "counts",
                     "parameters", "eval_summary", "error"],
    "review_sentiment": ["id", "review_id", "analysis_run_id", "market_id", "competitor_id", "reviewed_at", "label",
                         "confidence", "positive", "neutral", "negative"],
    "review_clause": ["id", "review_id", "analysis_run_id", "position", "text", "char_start", "char_end", "sentiment",
                      "confidence"],
    "aspect_mention": ["id", "review_id", "clause_id", "analysis_run_id", "aspect_category_id", "market_id",
                       "competitor_id", "reviewed_at", "sentiment", "confidence", "layer", "matched_text",
                       "match_start", "match_end", "similarity"],
    "aspect_aggregate": ["id", "analysis_run_id", "market_id", "competitor_id", "aspect_category_id", "grain",
                         "period_start", "period_end", "mentions", "positive", "neutral", "negative", "review_count",
                         "score", "pos_low", "pos_high", "neg_low", "neg_high", "confidence", "share_of_voice"],
    "emerging_issue": ["id", "analysis_run_id", "market_id", "competitor_id", "aspect_category_id", "kind",
                       "app_version", "recent_start", "recent_end", "prev_start", "prev_end", "recent_negative",
                       "recent_total", "prev_negative", "prev_total", "recent_share", "prev_share",
                       "relative_increase", "z_statistic", "p_value", "evidence_review_ids"],
    "topic": ["id", "analysis_run_id", "market_id", "label", "keywords", "size", "is_uncategorised",
              "nearest_aspect_key", "example_review_ids"],
    "topic_assignment": ["id", "topic_id", "review_id", "clause_id", "competitor_id", "reviewed_at"],
    "insight": ["id", "analysis_run_id", "market_id", "competitor_id", "aspect_category_id", "parent_id", "type",
                "kind", "title", "statement", "rewritten_statement", "written_by", "facts", "sample_size",
                "date_from", "date_to", "sources", "confidence", "impact", "priority", "suggested_investigation"],
    "insight_evidence": ["insight_id", "review_id"],
}


def connect() -> psycopg.Connection:
    # Prisma stores DateTime as timestamp(3) WITHOUT time zone, holding UTC. Pin the session to UTC so
    # tz-aware Python datetimes are converted correctly on write and naive values mean UTC on read.
    return psycopg.connect(database_url(), row_factory=dict_row, autocommit=False, options="-c TimeZone=UTC")


@contextmanager
def transaction(conn: psycopg.Connection) -> Iterator[psycopg.Connection]:
    with conn.transaction():
        yield conn


def copy_rows(conn: psycopg.Connection, table: str, columns: list[str], rows: Iterable[tuple]) -> int:
    """Fast bulk insert with COPY. Values are adapted by psycopg (lists → arrays, dicts → JSON via Jsonb)."""
    n = 0
    cols = ", ".join(f'"{c}"' for c in columns)
    with conn.cursor() as cur:
        with cur.copy(f'COPY "{table}" ({cols}) FROM STDIN') as cp:
            for row in rows:
                cp.write_row(row)
                n += 1
    return n


def jsonb(value) -> psycopg.types.json.Jsonb:
    from psycopg.types.json import Jsonb

    return Jsonb(value)


def as_json(value) -> str:
    return json.dumps(value, default=str)


_ = io  # keep import for type-checkers using copy buffers

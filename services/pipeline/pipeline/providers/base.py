"""Step 1 — ingest. Every provider returns reviews in one common schema.

Stored fields are limited to what analysis needs (CLAUDE.md §4): text, rating, date,
app version, source, collection time. Never reviewer names, avatars, or user IDs.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterator, Protocol, runtime_checkable

import psycopg

from pipeline.db import jsonb


@dataclass(frozen=True)
class RawReview:
    competitor_slug: str
    external_key: str  # stable per source; hashed when derived from a platform review ID
    text: str
    rating: int
    reviewed_at: datetime
    app_version: str | None = None
    collected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class CompetitorSpec:
    slug: str
    name: str
    description: str | None = None
    source_kind: str = "DEMO"  # DEMO | CSV | GOOGLE_PLAY
    source_label: str = "Demo dataset — synthetic"
    external_id: str | None = None


@runtime_checkable
class DataProvider(Protocol):
    """A source of raw reviews for one market."""

    name: str  # demo | csv | google_play
    market_slug: str
    market_name: str
    market_kind: str  # DEMO_SYNTHETIC | LIVE

    def competitors(self) -> list[CompetitorSpec]: ...

    def iter_reviews(self, competitor: str | None = None) -> Iterator[RawReview]: ...


def hash_key(*parts: str) -> str:
    """One-way key for platform review IDs, so we can dedupe re-collection without storing the raw ID."""
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:32]


# ── helpers to make sure the market skeleton exists ──

def ensure_workspace(conn: psycopg.Connection, slug: str) -> str:
    row = conn.execute("SELECT id FROM workspace WHERE slug = %s", (slug,)).fetchone()
    if row:
        return str(row["id"])
    row = conn.execute(
        "INSERT INTO workspace (name, slug, is_demo) VALUES (%s, %s, %s) RETURNING id",
        ("Demo workspace" if slug == "demo" else slug, slug, slug == "demo"),
    ).fetchone()
    return str(row["id"])


def ensure_market(conn: psycopg.Connection, workspace_id: str, slug: str, name: str, kind: str,
                  description: str | None, aspects: list[dict]) -> str:
    row = conn.execute("SELECT id FROM market WHERE workspace_id = %s AND slug = %s", (workspace_id, slug)).fetchone()
    if row:
        market_id = str(row["id"])
    else:
        market_id = str(conn.execute(
            "INSERT INTO market (workspace_id, name, slug, description, data_kind) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (workspace_id, name, slug, description, kind),
        ).fetchone()["id"])
    for i, a in enumerate(aspects):
        conn.execute(
            """INSERT INTO aspect_category (market_id, key, label, description, seed_keywords, sort_order)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (market_id, key) DO UPDATE
               SET label = EXCLUDED.label, description = EXCLUDED.description, seed_keywords = EXCLUDED.seed_keywords""",
            (market_id, a["key"], a["label"], a["description"], a["seedKeywords"], i),
        )
    return market_id


def ensure_competitor(conn: psycopg.Connection, market_id: str, spec: CompetitorSpec, color_index: int) -> tuple[str, str]:
    row = conn.execute("SELECT id FROM competitor WHERE market_id = %s AND slug = %s", (market_id, spec.slug)).fetchone()
    if row:
        cid = str(row["id"])
    else:
        cid = str(conn.execute(
            """INSERT INTO competitor (market_id, name, slug, description, color_index, updated_at)
               VALUES (%s, %s, %s, %s, %s, now()) RETURNING id""",
            (market_id, spec.name, spec.slug, spec.description, color_index),
        ).fetchone()["id"])
    row = conn.execute("SELECT id FROM data_source WHERE competitor_id = %s AND kind = %s", (cid, spec.source_kind)).fetchone()
    if row:
        sid = str(row["id"])
    else:
        sid = str(conn.execute(
            """INSERT INTO data_source (competitor_id, kind, label, external_id, config)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (cid, spec.source_kind, spec.source_label, spec.external_id, jsonb({})),
        ).fetchone()["id"])
    return cid, sid


def ingest(conn: psycopg.Connection, provider: DataProvider, workspace_slug: str, aspects: list[dict],
           market_description: str | None = None, competitor: str | None = None) -> tuple[str, int, int]:
    """Insert new reviews; existing (data_source, external_key) pairs are skipped. Returns (market_id, seen, inserted)."""
    ws = ensure_workspace(conn, workspace_slug)
    market_id = ensure_market(conn, ws, provider.market_slug, provider.market_name, provider.market_kind,
                              market_description, aspects)
    ids: dict[str, tuple[str, str]] = {}
    for i, spec in enumerate(provider.competitors()):
        ids[spec.slug] = ensure_competitor(conn, market_id, spec, i)
    seen = inserted = 0
    batch: list[tuple] = []

    def flush():
        nonlocal inserted
        if not batch:
            return
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO review (market_id, competitor_id, data_source_id, external_key, text, rating,
                                       reviewed_at, app_version, collected_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (data_source_id, external_key) DO NOTHING""",
                batch,
            )
            inserted += cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        batch.clear()

    for rv in provider.iter_reviews(competitor):
        cid, sid = ids[rv.competitor_slug]
        batch.append((market_id, cid, sid, rv.external_key, rv.text, rv.rating, rv.reviewed_at, rv.app_version,
                      rv.collected_at))
        seen += 1
        if len(batch) >= 1000:
            flush()
    flush()
    conn.execute(
        "UPDATE data_source SET last_collected_at = now() WHERE competitor_id IN (SELECT id FROM competitor WHERE market_id = %s)",
        (market_id,),
    )
    return market_id, seen, inserted

"""Database contract + end-to-end checks on the latest demo run.

Skipped automatically when PostgreSQL is not reachable or the pipeline has not run yet.
The planted-signal test is the Stage 5 acceptance test: all four signals from
docs/DEMO_DATA.md must be detected, and nothing obviously false may be flagged.
"""

import re

import pytest

from pipeline.db import CONTRACT


@pytest.fixture(scope="module")
def conn():
    try:
        from pipeline.db import connect

        c = connect()
        c.execute("SELECT 1")
    except Exception as e:  # pragma: no cover - environment dependent
        pytest.skip(f"database not reachable: {e}")
    yield c
    c.close()


def test_contract_tables_and_columns_exist(conn):
    rows = conn.execute(
        "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"
    ).fetchall()
    have = {(r["table_name"], r["column_name"]) for r in rows}
    missing = [f"{t}.{c}" for t, cols in CONTRACT.items() for c in cols if (t, c) not in have]
    assert not missing, f"Pipeline uses columns missing from the Prisma schema: {missing}"


@pytest.fixture(scope="module")
def demo(conn):
    m = conn.execute("SELECT id FROM market WHERE slug = 'quick-commerce-demo'").fetchone()
    if not m:
        pytest.skip("demo market not seeded")
    run = conn.execute(
        "SELECT id FROM analysis_run WHERE market_id = %s AND status = 'SUCCEEDED' ORDER BY finished_at DESC LIMIT 1", (m["id"],)
    ).fetchone()
    if not run:
        pytest.skip("no successful demo analysis run yet (python -m pipeline run --provider demo)")
    return m["id"], run["id"]


def _issues(conn, market_id, kind):
    return {
        (r["c"], r["a"])
        for r in conn.execute(
            """SELECT c.slug AS c, ac.key AS a FROM emerging_issue e JOIN competitor c ON c.id = e.competitor_id
               JOIN aspect_category ac ON ac.id = e.aspect_category_id WHERE e.market_id = %s AND e.kind = %s""",
            (market_id, kind),
        ).fetchall()
    }


def test_planted_signals_detected_and_nothing_obviously_false(conn, demo):
    market_id, _ = demo
    # 1. Kwikr refunds emerging issue (time window) — and no other time-window issue
    assert _issues(conn, market_id, "TIME_WINDOW") == {("kwikr", "refunds_returns")}
    # 4. MinuteMart app-experience drop from 5.2.0. Kwikr's refund rise also shows up as a version effect because
    #    v12.5.0 shipped during the ramp — a documented, expected confound (docs/DEMO_DATA.md).
    version = _issues(conn, market_id, "APP_VERSION")
    assert ("minutemart", "app_experience") in version
    assert version <= {("minutemart", "app_experience"), ("kwikr", "refunds_returns")}
    v = conn.execute(
        """SELECT e.app_version FROM emerging_issue e JOIN competitor c ON c.id = e.competitor_id
           JOIN aspect_category ac ON ac.id = e.aspect_category_id
           WHERE e.market_id = %s AND e.kind = 'APP_VERSION' AND c.slug = 'minutemart' AND ac.key = 'app_experience'""",
        (market_id,),
    ).fetchone()
    assert v["app_version"] == "5.2.0"
    insights = conn.execute(
        """SELECT i.kind::text AS kind, i.title, c.slug AS c, ac.key AS a FROM insight i
           LEFT JOIN competitor c ON c.id = i.competitor_id LEFT JOIN aspect_category ac ON ac.id = i.aspect_category_id
           WHERE i.market_id = %s AND i.type = 'OBSERVATION'""",
        (market_id,),
    ).fetchall()
    # 2. Basketo clearly best at product availability (competitive gap, leading)
    assert any(i["kind"] == "COMPETITIVE_GAP" and i["c"] == "basketo" and i["a"] == "product_availability" and "leads" in i["title"] for i in insights)
    # 3. Customer support is the (only) market-wide weakness
    assert {i["a"] for i in insights if i["kind"] == "MARKET_WEAKNESS"} == {"customer_support"}


def test_every_insight_has_evidence_and_suggestions_state_no_numbers(conn, demo):
    market_id, _ = demo
    rows = conn.execute(
        """SELECT i.type::text AS type, i.statement, COUNT(e.review_id) AS ev, i.facts
           FROM insight i LEFT JOIN insight_evidence e ON e.insight_id = i.id WHERE i.market_id = %s GROUP BY i.id""",
        (market_id,),
    ).fetchall()
    assert rows
    for r in rows:
        assert r["ev"] > 0, f"insight without evidence: {r['statement']}"
        if r["type"] != "OBSERVATION":
            text = r["statement"]
            version = str(r["facts"].get("app_version") or "")
            if version:
                text = text.replace(version, "")
            assert not re.search(r"\d", text), f"non-observation states a number: {r['statement']}"


def test_rerun_does_not_duplicate_results(conn, demo):
    market_id, run_id = demo
    stale = conn.execute(
        "SELECT COUNT(*) AS n FROM aspect_mention WHERE market_id = %s AND analysis_run_id <> %s", (market_id, run_id)
    ).fetchone()["n"]
    assert stale == 0
    dup = conn.execute(
        "SELECT COUNT(*) AS n FROM (SELECT review_id FROM review_sentiment WHERE market_id = %s GROUP BY review_id HAVING COUNT(*) > 1) x",
        (market_id,),
    ).fetchone()["n"]
    assert dup == 0

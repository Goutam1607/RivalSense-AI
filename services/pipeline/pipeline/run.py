"""`python -m pipeline run` — orchestrates pipeline steps 1–11 for one market."""

from __future__ import annotations

import logging
import random
import sys
import time
import traceback
from collections import Counter, defaultdict
from datetime import datetime, timezone

from pipeline.config import MODELS, PARAMS, configure_model_cache, market_config

log = logging.getLogger("pipeline")


def setup_logging() -> None:
    if logging.getLogger().handlers:
        return
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stdout)
    for noisy in ("httpx", "huggingface_hub", "sentence_transformers", "transformers", "urllib3", "filelock"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _provider(name: str, csv_path: str | None, market_slug: str | None, mapping: str | None, competitor: str | None):
    if name == "demo":
        from pipeline.providers.demo.provider import DemoProvider

        return DemoProvider()
    if name == "csv":
        if not csv_path or not market_slug:
            raise SystemExit("--provider csv needs --csv FILE and --market SLUG")
        from pipeline.providers.csv_provider import CsvProvider

        return CsvProvider(csv_path, market_slug, mapping, competitor if competitor and not mapping else None)
    if name == "google_play":
        from pipeline.providers.google_play import GooglePlayProvider

        return GooglePlayProvider()
    raise SystemExit(f"Unknown provider {name}")


def run_pipeline(provider: str, competitor: str | None = None, csv_path: str | None = None, market_slug: str | None = None,
                 workspace_slug: str = "demo", limit: int | None = None, skip_topics: bool = False,
                 mapping: str | None = None, spot_check: int = 15) -> int:
    setup_logging()
    configure_model_cache()
    from pipeline.db import connect, jsonb
    from pipeline.persist import (clear_market_results, update_reviews, write_aggregates, write_findings,
                                  write_insights, write_row_results, write_topics)
    from pipeline.providers.base import ingest
    from pipeline.steps.aggregate import MentionFact, compute_aggregates, window_stats
    from pipeline.steps.analyze import analyse, aspect_defs_from_db
    from pipeline.steps.insights import InsightBuilder
    from pipeline.steps.topics import discover_topics
    from pipeline.steps.trends import ReviewFact, detect_emerging_issues, detect_version_drops
    from pipeline.llm import get_provider, rewrite_validated

    t_start = time.perf_counter()
    cfg = market_config()
    conn = connect()
    # ── 1. ingest ──
    t = time.perf_counter()
    if provider == "db":
        if not market_slug:
            raise SystemExit("--provider db needs --market SLUG (and --workspace SLUG)")
        row = conn.execute(
            "SELECT m.id::text AS id FROM market m JOIN workspace w ON w.id = m.workspace_id WHERE w.slug = %s AND m.slug = %s",
            (workspace_slug, market_slug)).fetchone()
        if not row:
            raise SystemExit(f"No market '{market_slug}' in workspace '{workspace_slug}'.")
        market_id, seen, inserted = row["id"], 0, 0
        if conn.execute("SELECT 1 FROM market WHERE id = %s AND slug IN (%s, %s)",
                        (market_id, cfg["demo"]["market"]["slug"], cfg["live"]["market"]["slug"])).fetchone():
            from pipeline.providers.base import ensure_market  # keep config-managed taxonomies in sync
            ensure_market(conn, conn.execute("SELECT workspace_id FROM market WHERE id = %s", (market_id,)).fetchone()["workspace_id"],
                          market_slug, "", "LIVE", None, cfg["aspects"])

        from types import SimpleNamespace

        prov = SimpleNamespace(market_slug=market_slug)
    else:
        prov = _provider(provider, csv_path, market_slug, mapping, competitor)
        market_id, seen, inserted = ingest(conn, prov, workspace_slug, cfg["aspects"],
                                           getattr(prov, "market_description", None), competitor)
    conn.commit()
    t_ingest = time.perf_counter() - t
    log.info("Step 1 ingest (%s): %d reviews read, %d new", provider, seen, inserted)

    # carry the latest gold-set evaluation forward so reports from this run can cite it
    prev = conn.execute("SELECT eval_summary FROM analysis_run WHERE market_id = %s AND status = 'SUCCEEDED' "
                        "ORDER BY finished_at DESC LIMIT 1", (market_id,)).fetchone()
    carried = {k: v for k, v in ((prev or {}).get("eval_summary") or {}).items() if k != "synthetic_sanity"}
    run_id = str(conn.execute(
        "INSERT INTO analysis_run (market_id, status, provider, parameters, models, eval_summary) VALUES (%s, 'RUNNING', %s, %s, %s, %s) RETURNING id",
        (market_id, provider, jsonb(PARAMS.to_json()), jsonb({"planned": MODELS.__dict__}), jsonb(carried) if carried else None),
    ).fetchone()["id"])
    conn.commit()
    log.info("Analysis run %s started for market %s", run_id, prov.market_slug)

    try:
        rows = conn.execute(
            """SELECT r.id::text AS id, r.external_key, r.competitor_id::text AS competitor_id, r.text, r.rating,
                      r.reviewed_at, r.app_version, ds.kind::text AS source
               FROM review r JOIN data_source ds ON ds.id = r.data_source_id
               WHERE r.market_id = %s ORDER BY r.reviewed_at, r.external_key""",
            (market_id,),
        ).fetchall()
        if limit:
            rows = random.Random(0).sample(rows, min(limit, len(rows)))
        aspect_rows = conn.execute(
            "SELECT id::text AS id, key, label, description, seed_keywords FROM aspect_category WHERE market_id = %s ORDER BY sort_order",
            (market_id,),
        ).fetchall()
        comp_rows = conn.execute(
            "SELECT id::text AS id, name FROM competitor WHERE market_id = %s AND status = 'ACTIVE'", (market_id,)
        ).fetchall()
        source_labels = sorted({r["label"] for r in conn.execute(
            "SELECT DISTINCT ds.label FROM data_source ds JOIN competitor c ON c.id = ds.competitor_id WHERE c.market_id = %s",
            (market_id,)).fetchall()})
        query_terms = {a["key"]: a.get("query", a["label"].lower()) for a in cfg["aspects"]}
        aspects = aspect_defs_from_db(aspect_rows, query_terms)
        aspect_ids = {a.key: a.id for a in aspects}
        if not rows:
            raise SystemExit("No reviews in this market yet.")

        # ── 2–7. clean, language, clauses, aspects, aspect sentiment, overall sentiment ──
        result = analyse(rows, aspects)
        by_id = {r["id"]: r for r in rows}

        analysed_ids = [rid for rid, o in result.reviews.items() if o.status == "ANALYSED"]
        mention_facts = [MentionFact(m.review_id, by_id[m.review_id]["competitor_id"], m.aspect_key, m.sentiment,
                                     by_id[m.review_id]["reviewed_at"]) for m in result.mentions]
        review_facts = [ReviewFact(rid, by_id[rid]["competitor_id"], by_id[rid]["reviewed_at"], by_id[rid]["app_version"])
                        for rid in analysed_ids]
        as_of = max(r.reviewed_at for r in review_facts)

        # ── 8. topics on negative clauses ──
        t = time.perf_counter()
        topics, assignments, member_reviews, member_dates = [], [], {}, {}
        if not skip_topics:
            # candidates: negative clauses that no fixed aspect category detected (CLAUDE.md §6.8)
            with_aspect = {m.clause_id for m in result.mentions}
            idx = [i for i, c in enumerate(result.clauses)
                   if c.sentiment == "NEGATIVE" and c.id not in with_aspect and len(c.text.split()) >= 3]
            sel = [result.clauses[i] for i in idx]
            from pipeline.steps.aspects import EmbeddingMatcher
            from pipeline.steps.models import Embedder

            matcher = EmbeddingMatcher(aspects, Embedder(), PARAMS.embedding_threshold, PARAMS.embedding_margin)

            def nearest_aspect(vec):
                sims = matcher.similarities(vec[None, :])[0]
                j = int(sims.argmax())
                return matcher.aspect_keys[j], float(sims[j])

            topics = discover_topics([c.text for c in sel], [c.review_id for c in sel], result.clause_vectors[idx],
                                     nearest_aspect, PARAMS.topic_min_cluster_size,
                                     extra_stopwords={w.lower() for c in comp_rows for w in c["name"].split()})
            for tp in topics:
                members = [sel[i] for i in tp.members]
                member_reviews[tp.id] = [c.review_id for c in members]
                dates = [by_id[c.review_id]["reviewed_at"] for c in members]
                member_dates[tp.id] = (min(dates), max(dates))
                for c in members:
                    assignments.append((tp.id, c.review_id, c.id, by_id[c.review_id]["competitor_id"],
                                        by_id[c.review_id]["reviewed_at"]))
        t_topics = time.perf_counter() - t

        # ── 9. aggregation ──
        t = time.perf_counter()
        aggregates = compute_aggregates(mention_facts, [(f.competitor_id, f.reviewed_at) for f in review_facts])
        # ── 10. trends ──
        emerging = detect_emerging_issues(mention_facts, review_facts, as_of)
        versions = detect_version_drops(mention_facts, review_facts)
        # ── 11. insights ──
        from datetime import timedelta

        stats = window_stats(mention_facts, as_of - timedelta(days=PARAMS.insight_window_days), as_of + timedelta(seconds=1))
        builder = InsightBuilder({c["id"]: c["name"] for c in comp_rows}, {a.key: a.label for a in aspects},
                                 source_labels, mention_facts, as_of)
        builder.emerging(emerging)
        builder.version_drops(versions)
        builder.gaps_and_rankings(stats)
        builder.topics(topics, member_reviews, member_dates)
        llm = get_provider()
        rewritten = 0
        for ins in builder.out:
            text, by = rewrite_validated(llm, ins.statement, ins.facts)
            ins.rewritten_statement, ins.written_by = text, by
            rewritten += text is not None
        t_findings = time.perf_counter() - t

        # ── persist ──
        t = time.perf_counter()
        with conn.transaction():
            clear_market_results(conn, market_id)
            update_reviews(conn, result)
            written = write_row_results(conn, run_id, market_id, result, by_id, aspect_ids)
            written["aggregates"] = write_aggregates(conn, run_id, market_id, aggregates, aspect_ids)
            written["findings"] = write_findings(conn, run_id, market_id, emerging + versions, aspect_ids)
            written["topic_assignments"] = write_topics(conn, run_id, market_id, topics, assignments)
            written["insight_evidence_links"] = write_insights(conn, run_id, market_id, builder.out, aspect_ids, source_labels)
        t_persist = time.perf_counter() - t

        total = time.perf_counter() - t_start
        counts = {
            **result.counts,
            "ingest_seen": seen, "ingest_new": inserted, "as_of": as_of.isoformat(),
            "topics": len(topics), "uncategorised_topics": sum(t.is_uncategorised for t in topics),
            "aggregates": len(aggregates), "emerging_issues": len(emerging), "version_drops": len(versions),
            "insights": len(builder.out), "insights_by_type": dict(Counter(i.type for i in builder.out)),
            "insights_rewritten_by_llm": rewritten, "llm_provider": llm.name, "written": written,
            "timings_s": {"ingest": round(t_ingest, 2), **result.timings, "topics": round(t_topics, 2),
                          "findings": round(t_findings, 2), "persist": round(t_persist, 2), "total": round(total, 2)},
        }
        conn.execute("UPDATE analysis_run SET status='SUCCEEDED', finished_at=clock_timestamp(), counts=%s, models=%s WHERE id=%s",
                     (jsonb(counts), jsonb(result.models), run_id))
        conn.commit()
    except BaseException as e:
        conn.rollback()
        conn.execute("UPDATE analysis_run SET status='FAILED', finished_at=clock_timestamp(), error=%s WHERE id=%s",
                     (f"{type(e).__name__}: {e}"[:2000], run_id))
        conn.commit()
        conn.close()
        if isinstance(e, (KeyboardInterrupt, SystemExit)):
            raise
        traceback.print_exc()
        log.error("Analysis run %s FAILED: %s", run_id, e)
        return 1

    _print_summary(counts, emerging, versions, builder.out, topics, {c["id"]: c["name"] for c in comp_rows},
                   {a.key: a.label for a in aspects})
    if spot_check:
        _spot_check(result, by_id, spot_check)
    if provider == "demo":
        try:
            from pipeline.eval.synthetic import sanity_check

            res = sanity_check(conn, market_id)
            conn.execute("UPDATE analysis_run SET eval_summary = COALESCE(eval_summary, '{}'::jsonb) || %s WHERE id = %s",
                         (jsonb({"synthetic_sanity": res}), run_id))
            conn.commit()
        except Exception as e:  # sanity output is informational only
            log.warning("Synthetic sanity check skipped: %s", e)
    conn.close()
    log.info("Run %s finished in %.1f s", run_id, total)
    return 0


def _print_summary(counts, emerging, versions, insights, topics, comps, aspects) -> None:
    print("\n" + "=" * 78)
    print("PIPELINE SUMMARY")
    print("=" * 78)
    for k in ["reviews_total", "duplicates", "spam", "analysed", "not_analysed_language", "clauses",
              "aspect_detections", "aspect_mentions", "topics", "uncategorised_topics", "aggregates",
              "emerging_issues", "version_drops", "insights"]:
        print(f"  {k:<26} {counts.get(k)}")
    print(f"  {'languages':<26} {counts.get('languages')}")
    print(f"  {'detections_by_layer':<26} {counts.get('detections_by_layer')}")
    print(f"  {'mentions_by_sentiment':<26} {counts.get('mentions_by_sentiment')}")
    print(f"  {'insights_by_type':<26} {counts.get('insights_by_type')}  (LLM: {counts.get('llm_provider')})")
    print("  timings (s):", counts["timings_s"])
    print("\nEmerging issues (time window):")
    for f in emerging:
        print(f"  - {comps[f.competitor_id]} / {aspects[f.aspect_key]}: {f.prev_share:.1%} → {f.recent_share:.1%} "
              f"(neg {f.prev_negative}→{f.recent_negative}), z={f.z:.2f}, p={f.p:.4f}")
    print("App-version drops:")
    for f in versions:
        print(f"  - {comps[f.competitor_id]} / {aspects[f.aspect_key]} from v{f.app_version}: {f.prev_share:.1%} → "
              f"{f.recent_share:.1%}, z={f.z:.2f}, p={f.p:.2g}")
    print("Market-wide weaknesses / gaps:")
    for i in insights:
        if i.type == "OBSERVATION" and i.kind in ("MARKET_WEAKNESS", "COMPETITIVE_GAP"):
            print(f"  - [{i.kind}] {i.title}")
    print("Topics:")
    for t in topics:
        print(f"  - {'[uncategorised] ' if t.is_uncategorised else f'[{t.nearest_aspect_key}] '}{t.label} (n={t.size})")
    print()


def _spot_check(result, by_id, n: int) -> None:
    rng = random.Random(42)
    analysed = [o for o in result.reviews.values() if o.status == "ANALYSED"]
    mentions_by_review = defaultdict(list)
    for m in result.mentions:
        mentions_by_review[m.review_id].append(m)
    print("=" * 78)
    print(f"SPOT CHECK — {n} random analysed reviews")
    print("=" * 78)
    for o in rng.sample(analysed, min(n, len(analysed))):
        r = by_id[o.id]
        print(f"\n★{r['rating']}  overall={o.sentiment} ({o.confidence:.2f})  | {o.clean_text[:220]}")
        for m in sorted(mentions_by_review[o.id], key=lambda m: m.aspect_key):
            print(f"     → {m.aspect_key:<22} {m.sentiment:<8} conf={m.confidence:.2f}  layer={m.layer:<9} "
                  f"match={m.matched_text!r}{'' if m.similarity is None else f'  sim={m.similarity:.2f}'}")
    print()


_ = datetime, timezone

"""Sanity check against the demo generator's hidden ground-truth labels.

This is NOT the real evaluation: the demo reviews come from our own templates, and the
lexicon was written knowing the same vocabulary, so scores here are optimistic (circular).
The honest evaluation uses hand-labelled real reviews (eval/gold.csv) — see evaluate.py.
"""

from __future__ import annotations

import json
from collections import defaultdict

from pipeline.config import GENERATED_DIR

LABEL = {"positive": "POSITIVE", "neutral": "NEUTRAL", "negative": "NEGATIVE"}


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f


def macro_f1(pairs: list[tuple[str, str]], labels=("POSITIVE", "NEUTRAL", "NEGATIVE")) -> float:
    scores = []
    for lab in labels:
        tp = sum(1 for g, p in pairs if g == lab and p == lab)
        fp = sum(1 for g, p in pairs if g != lab and p == lab)
        fn = sum(1 for g, p in pairs if g == lab and p != lab)
        scores.append(prf(tp, fp, fn)[2])
    return sum(scores) / len(scores)


def compute(conn, market_id: str) -> dict:
    truth = {}
    with (GENERATED_DIR / "demo_ground_truth.jsonl").open(encoding="utf-8") as f:
        for line in f:
            g = json.loads(line)
            truth[g["external_key"]] = g
    reviews = conn.execute(
        """SELECT r.id::text AS id, r.external_key, r.status::text AS status, rs.label::text AS overall
           FROM review r LEFT JOIN review_sentiment rs ON rs.review_id = r.id WHERE r.market_id = %s""",
        (market_id,),
    ).fetchall()
    mentions = defaultdict(dict)
    for m in conn.execute(
        """SELECT am.review_id::text AS review_id, ac.key, am.sentiment::text AS sentiment
           FROM aspect_mention am JOIN aspect_category ac ON ac.id = am.aspect_category_id WHERE am.market_id = %s""",
        (market_id,),
    ).fetchall():
        mentions[m["review_id"]][m["key"]] = m["sentiment"]

    counts = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "sent_ok": 0})
    overall_pairs = []
    cleaning = {"dup_caught": 0, "dup_total": 0, "spam_caught": 0, "spam_total": 0, "non_en_caught": 0, "non_en_total": 0}
    for r in reviews:
        g = truth.get(r["external_key"])
        if not g:
            continue
        if g["is_duplicate"]:
            cleaning["dup_total"] += 1
            cleaning["dup_caught"] += r["status"] == "DUPLICATE"
        if g["is_spam"]:
            cleaning["spam_total"] += 1
            cleaning["spam_caught"] += r["status"] == "SPAM"
        if g["language"] != "en" and not g["is_duplicate"]:
            cleaning["non_en_total"] += 1
            cleaning["non_en_caught"] += r["status"] == "NOT_ANALYSED_LANGUAGE"
        if r["status"] != "ANALYSED" or g["language"] != "en" or g["is_spam"] or g["is_duplicate"]:
            continue
        if r["overall"]:
            overall_pairs.append((LABEL[g["overall"]], r["overall"]))
        gold = {a["aspect"]: LABEL[a["sentiment"]] for a in g["aspects"] if not a["aspect"].startswith("other:")}
        pred = mentions.get(r["id"], {})
        for a in set(gold) | set(pred):
            if a in gold and a in pred:
                counts[a]["tp"] += 1
                counts[a]["sent_ok"] += gold[a] == pred[a]
            elif a in pred:
                counts[a]["fp"] += 1
            else:
                counts[a]["fn"] += 1
    per_aspect = {}
    for a, c in sorted(counts.items()):
        p, r_, f = prf(c["tp"], c["fp"], c["fn"])
        per_aspect[a] = {"precision": p, "recall": r_, "f1": f, "support": c["tp"] + c["fn"],
                         "sentiment_accuracy": c["sent_ok"] / c["tp"] if c["tp"] else 0.0}
    tp = sum(c["tp"] for c in counts.values())
    fp = sum(c["fp"] for c in counts.values())
    fn = sum(c["fn"] for c in counts.values())
    p, r_, f = prf(tp, fp, fn)
    return {"per_aspect": per_aspect, "micro": {"precision": p, "recall": r_, "f1": f},
            "aspect_sentiment_accuracy": sum(c["sent_ok"] for c in counts.values()) / tp if tp else 0.0,
            "overall_sentiment_macro_f1": macro_f1(overall_pairs), "overall_n": len(overall_pairs), "cleaning": cleaning}


def sanity_check(conn, market_id: str) -> dict:
    res = compute(conn, market_id)
    print("=" * 78)
    print("SANITY CHECK vs synthetic ground truth (optimistic — templates are ours; see INTERVIEW_NOTES)")
    print("=" * 78)
    print(f"  {'aspect':<22} {'prec':>6} {'recall':>7} {'F1':>6} {'support':>8} {'sent.acc':>9}")
    for a, m in res["per_aspect"].items():
        print(f"  {a:<22} {m['precision']:>6.2f} {m['recall']:>7.2f} {m['f1']:>6.2f} {m['support']:>8} {m['sentiment_accuracy']:>9.2f}")
    mi = res["micro"]
    print(f"  {'micro avg':<22} {mi['precision']:>6.2f} {mi['recall']:>7.2f} {mi['f1']:>6.2f}")
    print(f"  aspect sentiment accuracy (on correctly detected aspects): {res['aspect_sentiment_accuracy']:.2f}")
    print(f"  overall review sentiment macro-F1: {res['overall_sentiment_macro_f1']:.2f} (n = {res['overall_n']})")
    c = res["cleaning"]
    print(f"  cleaning: duplicates caught {c['dup_caught']}/{c['dup_total']}, spam caught {c['spam_caught']}/{c['spam_total']}, "
          f"non-English set aside {c['non_en_caught']}/{c['non_en_total']}")
    print()
    return res

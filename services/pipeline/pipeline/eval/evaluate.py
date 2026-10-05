"""`python -m pipeline eval` — honest evaluation of the NLP pipeline.

* Gold set: eval/gold.csv — hand-labelled REAL reviews (aspects + sentiment, overall sentiment).
* Synthetic sanity check: the demo generator's hidden labels (optimistic: same vocabulary as our lexicon).

Both compare the pipeline (lexicon + embeddings + ABSA, transformer sentiment) with a simple baseline
(keyword lexicon only + VADER). Results go to docs/EVALUATION.md, eval/results.json and the
analysis_run.eval_summary column (so reports can cite them).
"""

from __future__ import annotations

import csv
import json
import random
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pipeline.config import GENERATED_DIR, PIPELINE_DIR, REPO_ROOT, configure_model_cache, market_config

LABELS = ("POSITIVE", "NEUTRAL", "NEGATIVE")
L = {"positive": "POSITIVE", "neutral": "NEUTRAL", "negative": "NEGATIVE"}


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def macro_f1(pairs: list[tuple[str, str]]) -> float:
    return sum(prf(sum(g == l and p == l for g, p in pairs), sum(g != l and p == l for g, p in pairs),
                   sum(g == l and p != l for g, p in pairs))[2] for l in LABELS) / len(LABELS)


def confusion(pairs: list[tuple[str, str]]) -> dict[str, dict[str, int]]:
    m = {g: {p: 0 for p in LABELS} for g in LABELS}
    for g, p in pairs:
        m[g][p] += 1
    return m


# ───────────────────────── predictions ─────────────────────────

def _aspect_defs():
    from pipeline.steps.aspects import AspectDef

    return [AspectDef(a["key"], a["key"], a["label"], a.get("query", a["label"].lower()), a["description"], tuple(a["seedKeywords"]))
            for a in market_config()["aspects"]]


def predict_model(texts: list[str]) -> list[tuple[dict[str, str], str | None]]:
    """Run the real pipeline steps 2–7 in memory. Returns (aspect → sentiment, overall) per text."""
    from pipeline.steps.analyze import analyse

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [{"id": str(i), "external_key": f"k{i}", "competitor_id": "c", "text": t, "rating": 3, "reviewed_at": now,
             "app_version": None, "source": f"eval{i}"} for i, t in enumerate(texts)]
    res = analyse(rows, _aspect_defs())
    by_review = defaultdict(dict)
    for m in res.mentions:
        by_review[m.review_id][m.aspect_key] = m.sentiment
    return [(by_review.get(str(i), {}), res.reviews[str(i)].sentiment) for i in range(len(texts))]


def predict_baseline(texts: list[str]) -> list[tuple[dict[str, str], str]]:
    """Baseline: keyword lexicon only (no embeddings, no ABSA) + VADER on the clause / review."""
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

    from pipeline.steps.aspects import Lexicon
    from pipeline.steps.clauses import split_clauses
    from pipeline.steps.clean import clean_text

    vader = SentimentIntensityAnalyzer()
    lex = Lexicon(_aspect_defs())

    def lab(t: str) -> str:
        c = vader.polarity_scores(t)["compound"]
        return "POSITIVE" if c >= 0.05 else "NEGATIVE" if c <= -0.05 else "NEUTRAL"

    out = []
    for t in texts:
        ct = clean_text(t)
        aspects: dict[str, str] = {}
        for c in split_clauses(ct):
            for key in lex.match(c.text):
                aspects.setdefault(key, lab(c.text))
        out.append((aspects, lab(ct)))
    return out


def score(gold: list[tuple[dict[str, str], str]], pred: list[tuple[dict[str, str], str | None]], keys: list[str]) -> dict:
    per = {k: Counter() for k in keys}
    sent_ok = sent_n = 0
    for (ga, _), (pa, _) in zip(gold, pred):
        for k in keys:
            g, p = k in ga, k in pa
            per[k]["tp" if g and p else "fp" if p else "fn" if g else "tn"] += 1
            if g and p:
                sent_n += 1
                sent_ok += ga[k] == pa[k]
    per_aspect = {}
    for k, c in per.items():
        p, r, f = prf(c["tp"], c["fp"], c["fn"])
        per_aspect[k] = {"precision": round(p, 3), "recall": round(r, 3), "f1": round(f, 3), "support": c["tp"] + c["fn"]}
    tp = sum(c["tp"] for c in per.values()); fp = sum(c["fp"] for c in per.values()); fn = sum(c["fn"] for c in per.values())
    mp, mr, mf = prf(tp, fp, fn)
    overall = [(g, p or "NEUTRAL") for (_, g), (_, p) in zip(gold, pred)]
    return {
        "per_aspect": per_aspect,
        "aspect_micro": {"precision": round(mp, 3), "recall": round(mr, 3), "f1": round(mf, 3)},
        "aspect_sentiment_accuracy": round(sent_ok / sent_n, 3) if sent_n else None,
        "aspect_sentiment_n": sent_n,
        "overall_macro_f1": round(macro_f1(overall), 3),
        "overall_accuracy": round(sum(g == p for g, p in overall) / len(overall), 3) if overall else None,
        "overall_confusion": confusion(overall),
    }


# ───────────────────────── data ─────────────────────────

def load_gold(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = [r for r in csv.DictReader(path.open(encoding="utf-8")) if r.get("overall")]
    for r in rows:
        r["gold_aspects"] = {p.split(":")[0]: L[p.split(":")[1]] for p in r["aspects"].split(";") if ":" in p}
        r["gold_overall"] = L[r["overall"]]
    return rows


def load_synthetic(n: int = 1500, seed: int = 11) -> list[dict]:
    reviews = {}
    rpath, tpath = GENERATED_DIR / "demo_reviews.jsonl", GENERATED_DIR / "demo_ground_truth.jsonl"
    if not rpath.exists():
        return []
    for line in rpath.open(encoding="utf-8"):
        r = json.loads(line)
        reviews[r["external_key"]] = r["text"]
    rows = []
    for line in tpath.open(encoding="utf-8"):
        g = json.loads(line)
        if g["language"] != "en" or g["is_spam"] or g["is_duplicate"]:
            continue
        rows.append({"text": reviews[g["external_key"]],
                     "gold_aspects": {a["aspect"]: L[a["sentiment"]] for a in g["aspects"] if not a["aspect"].startswith("other:")},
                     "gold_overall": L[g["overall"]]})
    random.Random(seed).shuffle(rows)
    return rows[:n]


def evaluate_set(rows: list[dict]) -> dict:
    keys = [a["key"] for a in market_config()["aspects"]]
    texts = [r["text"] for r in rows]
    gold = [(r["gold_aspects"], r["gold_overall"]) for r in rows]
    return {"n": len(rows), "model": score(gold, predict_model(texts), keys), "baseline": score(gold, predict_baseline(texts), keys)}


# ───────────────────────── report ─────────────────────────

def _table(res: dict) -> list[str]:
    m, b = res["model"], res["baseline"]
    out = ["| Aspect | Support | Model P | Model R | Model F1 | Baseline P | Baseline R | Baseline F1 |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for k in m["per_aspect"]:
        x, y = m["per_aspect"][k], b["per_aspect"][k]
        flag = " ⚠︎" if x["f1"] < y["f1"] else ""
        out.append(f"| {k}{flag} | {x['support']} | {x['precision']:.2f} | {x['recall']:.2f} | **{x['f1']:.2f}** | {y['precision']:.2f} | {y['recall']:.2f} | {y['f1']:.2f} |")
    out.append(f"| **micro average** | | {m['aspect_micro']['precision']:.2f} | {m['aspect_micro']['recall']:.2f} | **{m['aspect_micro']['f1']:.2f}** | "
               f"{b['aspect_micro']['precision']:.2f} | {b['aspect_micro']['recall']:.2f} | {b['aspect_micro']['f1']:.2f} |")
    out += ["", "| Sentiment metric | Model | Baseline (VADER) |", "|---|---:|---:|",
            f"| Aspect sentiment accuracy (on correctly detected aspects) | **{m['aspect_sentiment_accuracy']}** (n={m['aspect_sentiment_n']}) | {b['aspect_sentiment_accuracy']} (n={b['aspect_sentiment_n']}) |",
            f"| Overall sentiment macro-F1 | **{m['overall_macro_f1']:.2f}** | {b['overall_macro_f1']:.2f} |",
            f"| Overall sentiment accuracy | {m['overall_accuracy']:.2f} | {b['overall_accuracy']:.2f} |", ""]
    out += ["Overall sentiment confusion matrix (model; rows = gold, columns = predicted):", "", "| gold \\ predicted | positive | neutral | negative |", "|---|---:|---:|---:|"]
    for g in LABELS:
        row = m["overall_confusion"][g]
        out.append(f"| {g.lower()} | {row['POSITIVE']} | {row['NEUTRAL']} | {row['NEGATIVE']} |")
    return out


def _weak_aspects(res: dict) -> list[str]:
    return [k for k in res["model"]["per_aspect"] if res["model"]["per_aspect"][k]["f1"] < res["baseline"]["per_aspect"][k]["f1"]]


def write_markdown(path: Path, gold: dict | None, synthetic: dict | None) -> None:
    lines = ["# Evaluation", "", f"_Generated by `python -m pipeline eval` on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}._", "",
             "The pipeline (keyword lexicon + sentence-embedding aspect detection, DeBERTa ABSA aspect sentiment, RoBERTa overall sentiment) "
             "is compared with a simple baseline: the same keyword lexicon only, with VADER sentiment on each clause and on the whole review.", ""]
    lines += ["## 1. Gold set — hand-labelled real reviews", ""]
    if gold:
        lines += [f"{gold['n']} real public Google Play reviews, sampled stratified by app × star rating and labelled by hand "
                  "(labels were not pre-filled with model output).", ""] + _table(gold)
        weak = _weak_aspects(gold)
        if weak:
            lines += ["", f"**Where the model does not beat the baseline:** {', '.join(weak)}. "
                      "Suggested improvement: add the missed phrasings from the gold reviews to the seed lexicon (the embedding layer "
                      "is tuned for precision and rarely rescues these), and re-check whether the ABSA model's neutral bias on implicit "
                      "complaints (\"still waiting for my refund\") pulls sentiment accuracy down for these aspects."]
    else:
        lines += ["**Pending.** `services/pipeline/eval/gold.csv` has no labelled rows yet. To create it:", "",
                  "```powershell", "cd services/pipeline", "python -m pipeline collect --cap 300        # small, polite sample of real reviews",
                  "python -m pipeline run --provider db --market quick-commerce-live", "python -m pipeline sample-gold --n 200",
                  "python -m pipeline label                     # label in the terminal; resumable", "python -m pipeline eval", "```", ""]
    lines += ["", "## 2. Sanity check — synthetic demo labels (optimistic)", ""]
    if synthetic:
        lines += [f"{synthetic['n']} English reviews from the synthetic demo generator. **This is not a real evaluation:** the reviews were "
                  "produced from our own templates and the lexicon shares their vocabulary, so these numbers are an upper bound "
                  "that only shows the pipeline is wired correctly.", ""] + _table(synthetic)
    lines += ["", "## How to read this", "",
              "* **Precision** — of the aspects the system tagged, the share that were right. **Recall** — of the aspects really mentioned, the share it found.",
              "* **Aspect sentiment accuracy** is measured only where both gold and prediction agree an aspect is present.",
              "* **Macro-F1** averages F1 over positive / neutral / negative so the rarer neutral class counts as much as the others.",
              "* ⚠︎ marks aspects where the model's F1 is below the baseline's.", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def store_summary(gold: dict | None, synthetic: dict | None) -> None:
    """Attach the latest evaluation to the newest successful run of every market (reports cite it)."""
    try:
        from pipeline.db import connect, jsonb
    except Exception:
        return
    summary = {"evaluated_at": datetime.now(timezone.utc).isoformat()}
    if gold:
        m, b = gold["model"], gold["baseline"]
        summary["gold"] = {"n": gold["n"], "aspect_micro_f1": m["aspect_micro"]["f1"], "aspect_sentiment_accuracy": m["aspect_sentiment_accuracy"],
                           "overall_macro_f1": m["overall_macro_f1"], "baseline_aspect_micro_f1": b["aspect_micro"]["f1"],
                           "baseline_overall_macro_f1": b["overall_macro_f1"]}
    if synthetic:
        m = synthetic["model"]
        summary["synthetic_eval"] = {"n": synthetic["n"], "aspect_micro_f1": m["aspect_micro"]["f1"], "overall_macro_f1": m["overall_macro_f1"],
                                     "baseline_aspect_micro_f1": synthetic["baseline"]["aspect_micro"]["f1"],
                                     "baseline_overall_macro_f1": synthetic["baseline"]["overall_macro_f1"]}
    try:
        with connect() as conn:
            for r in conn.execute("""SELECT DISTINCT ON (market_id) id, eval_summary FROM analysis_run WHERE status = 'SUCCEEDED'
                                     ORDER BY market_id, finished_at DESC""").fetchall():
                merged = {**(r["eval_summary"] or {}), **summary}
                conn.execute("UPDATE analysis_run SET eval_summary = %s WHERE id = %s", (jsonb(merged), r["id"]))
            conn.commit()
    except Exception as e:  # database optional for evaluation
        print(f"(Could not store the summary in the database: {type(e).__name__})")


def main(gold_path: Path, synthetic: bool = False, out: Path | None = None) -> int:
    configure_model_cache()
    gold_rows = [] if synthetic else load_gold(gold_path)
    gold = evaluate_set(gold_rows) if gold_rows else None
    syn_rows = load_synthetic()
    syn = evaluate_set(syn_rows) if syn_rows else None
    for name, res in (("GOLD (real reviews)", gold), ("SYNTHETIC sanity check", syn)):
        if not res:
            continue
        m, b = res["model"], res["baseline"]
        print(f"\n{name}: n = {res['n']}")
        print(f"  {'aspect':<22} {'model F1':>9} {'baseline F1':>12} {'support':>8}")
        for k in m["per_aspect"]:
            print(f"  {k:<22} {m['per_aspect'][k]['f1']:>9.2f} {b['per_aspect'][k]['f1']:>12.2f} {m['per_aspect'][k]['support']:>8}")
        print(f"  {'micro':<22} {m['aspect_micro']['f1']:>9.2f} {b['aspect_micro']['f1']:>12.2f}")
        print(f"  aspect sentiment accuracy: model {m['aspect_sentiment_accuracy']}  baseline {b['aspect_sentiment_accuracy']}")
        print(f"  overall sentiment macro-F1: model {m['overall_macro_f1']:.2f}  baseline {b['overall_macro_f1']:.2f}")
    if not gold:
        print(f"\nGold set: no labelled rows in {gold_path}. See docs/EVALUATION.md for how to create it.")
    out = out or REPO_ROOT / "docs" / "EVALUATION.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    write_markdown(out, gold, syn)
    (PIPELINE_DIR / "eval").mkdir(exist_ok=True)
    (PIPELINE_DIR / "eval" / "results.json").write_text(json.dumps({"gold": gold, "synthetic": syn}, indent=2), encoding="utf-8")
    store_summary(gold, syn)
    print(f"\nWrote {out} and eval/results.json")
    return 0

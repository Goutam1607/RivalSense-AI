"""`python -m pipeline sample-gold` — draw a stratified sample of REAL reviews for hand labelling.

Stratified by competitor × star rating so every app and every rating level is represented.
Labels are left EMPTY on purpose: pre-filling them with model predictions would anchor the
labeller to the model's answers and inflate the evaluation (see INTERVIEW_NOTES).
"""

from __future__ import annotations

import csv
import random
from collections import defaultdict
from pathlib import Path

FIELDS = ["review_id", "competitor", "rating", "text", "aspects", "overall", "notes"]


def sample_gold(n: int, out: Path, market_slug: str, seed: int = 7) -> int:
    from pipeline.db import connect

    if out.exists() and any(r.get("overall") for r in csv.DictReader(out.open(encoding="utf-8"))):
        print(f"{out} already contains labels — refusing to overwrite. Move it away first if you really want a new sample.")
        return 1
    with connect() as conn:
        rows = conn.execute(
            """SELECT r.id::text AS review_id, c.name AS competitor, r.rating, COALESCE(r.clean_text, r.text) AS text
               FROM review r JOIN competitor c ON c.id = r.competitor_id JOIN market m ON m.id = r.market_id
               WHERE m.slug = %s AND r.status = 'ANALYSED' AND length(COALESCE(r.clean_text, r.text)) BETWEEN 15 AND 600""",
            (market_slug,),
        ).fetchall()
    if not rows:
        print(f"No analysed English reviews in market '{market_slug}'. Collect and analyse real data first:\n"
              "  python -m pipeline collect --cap 300\n  python -m pipeline run --provider db --market quick-commerce-live")
        return 1
    strata: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for r in rows:
        strata[(r["competitor"], r["rating"])].append(r)
    rng = random.Random(seed)
    for v in strata.values():
        rng.shuffle(v)
    picked: list[dict] = []
    keys = sorted(strata)
    while len(picked) < n and any(strata[k] for k in keys):  # round-robin across strata
        for k in keys:
            if strata[k] and len(picked) < n:
                picked.append(strata[k].pop())
    rng.shuffle(picked)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in picked:
            w.writerow({"review_id": r["review_id"], "competitor": r["competitor"], "rating": r["rating"], "text": r["text"],
                        "aspects": "", "overall": "", "notes": ""})
    print(f"Wrote {len(picked)} unlabelled reviews to {out} ({len(keys)} competitor × rating strata).")
    print("Next: python -m pipeline label")
    return 0

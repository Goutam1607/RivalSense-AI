"""`python -m pipeline label` — label the gold set one review at a time in the terminal.

For each review you type:
  aspects:  space-separated  <number><sign>  e.g.  "1- 8+"  (1 = delivery_speed negative, 8 = refunds positive)
            signs: + positive, - negative, = neutral. Press Enter for "no aspect mentioned".
  overall:  p (positive) / u (neutral) / n (negative)
Commands at any prompt:  s = skip,  b = back one review,  q = save and quit.
Progress is saved after every review, so you can stop and resume any time.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

from pipeline.config import market_config
from pipeline.eval.sample import FIELDS

SIGN = {"+": "positive", "-": "negative", "=": "neutral"}
OVERALL = {"p": "positive", "u": "neutral", "n": "negative"}


def _save(path: Path, rows: list[dict]) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    tmp.replace(path)


def parse_aspects(s: str, keys: list[str]) -> str | None:
    """'1- 8+' → 'delivery_speed:negative;refunds_returns:positive'. Returns None if invalid."""
    out = []
    for tok in s.split():
        m = re.fullmatch(r"(\d+)([+\-=])", tok)
        if not m or not 1 <= int(m.group(1)) <= len(keys):
            return None
        out.append(f"{keys[int(m.group(1)) - 1]}:{SIGN[m.group(2)]}")
    return ";".join(dict.fromkeys(out))


def run_labeler(path: Path) -> int:
    if not path.exists():
        print(f"{path} not found. Create it first: python -m pipeline sample-gold")
        return 1
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    keys = [a["key"] for a in market_config()["aspects"]]
    legend = "  ".join(f"{i + 1}={k}" for i, k in enumerate(keys))
    i = next((k for k, r in enumerate(rows) if not r["overall"]), len(rows))
    while i < len(rows):
        r = rows[i]
        done = sum(1 for x in rows if x["overall"])
        print("\n" + "─" * 78)
        print(f"[{i + 1}/{len(rows)}]  labelled: {done}   competitor: {r['competitor']}   rating: {r['rating']}★")
        print(r["text"])
        print(f"\nAspects: {legend}")
        a = input("aspects (e.g. 1- 8+, Enter = none): ").strip()
        if a in ("q", "s", "b"):
            cmd = a
        else:
            parsed = parse_aspects(a, keys)
            if parsed is None:
                print("  ✗ Could not read that. Use number + sign, e.g. 1- 8+")
                continue
            o = input("overall (p/u/n): ").strip().lower()
            if o in ("q", "s", "b"):
                cmd = o
            elif o not in OVERALL:
                print("  ✗ Type p, u or n.")
                continue
            else:
                r["aspects"], r["overall"] = parsed, OVERALL[o]
                _save(path, rows)
                i += 1
                continue
        if cmd == "q":
            _save(path, rows)
            print("Saved. Run `python -m pipeline label` again to continue.")
            return 0
        if cmd == "s":
            i += 1
        if cmd == "b":
            i = max(0, i - 1)
    _save(path, rows)
    print(f"All {len(rows)} reviews processed. Next: python -m pipeline eval")
    return 0

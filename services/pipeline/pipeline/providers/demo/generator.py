"""Deterministic synthetic review generator for the demo market.

Standard library only, so `npm run seed` can call it with any Python 3.11+.
Same seed + same end date → byte-identical output (tested in tests/test_demo_generator.py).

Planted signals (documented in docs/DEMO_DATA.md):
  1. Kwikr — refunds_returns complaints rise steadily over the final 90 days  → emerging issue
  2. Basketo — clearly best at product_availability                          → competitive gap
  3. customer_support — weak for every competitor                             → market-wide weakness
  4. MinuteMart — app_experience collapses from app version 5.2.0 onwards     → version drop
"""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import templates as T

DEFAULT_SEED = 20261005
DEFAULT_END_DATE = date(2026, 9, 30)
MONTHS_OF_DATA = 12

COMPETITORS = ["dashly", "kwikr", "basketo", "minutemart"]
BRAND = {"dashly": "Dashly", "kwikr": "Kwikr", "basketo": "Basketo", "minutemart": "MinuteMart"}
BASE_MONTHLY_VOLUME = {"dashly": 135, "kwikr": 115, "basketo": 105, "minutemart": 90}

# (mention weight, P(positive), P(negative)); neutral = 1 - pos - neg
MARKET_BASELINE: dict[str, tuple[float, float, float]] = {
    "delivery_speed": (0.30, 0.60, 0.28),
    "pricing": (0.14, 0.36, 0.46),
    "discounts_offers": (0.10, 0.55, 0.30),
    "product_availability": (0.12, 0.40, 0.45),
    "product_quality": (0.13, 0.55, 0.35),
    "order_accuracy": (0.09, 0.35, 0.55),
    "customer_support": (0.09, 0.20, 0.66),
    "refunds_returns": (0.07, 0.40, 0.48),
    "app_experience": (0.10, 0.58, 0.28),
    "payments": (0.06, 0.45, 0.38),
}

OVERRIDES: dict[str, dict[str, tuple[float, float, float]]] = {
    "dashly": {
        "delivery_speed": (0.36, 0.84, 0.09),
        "order_accuracy": (0.09, 0.64, 0.22),
        "payments": (0.06, 0.68, 0.16),
        "pricing": (0.15, 0.30, 0.54),
        "customer_support": (0.09, 0.25, 0.60),
    },
    "kwikr": {
        "pricing": (0.16, 0.66, 0.20),
        "discounts_offers": (0.16, 0.78, 0.11),
        "customer_support": (0.09, 0.17, 0.70),
        "refunds_returns": (0.06, 0.40, 0.45),  # ramps up in the final 90 days, see _profile()
    },
    "basketo": {
        "product_availability": (0.18, 0.84, 0.07),  # signal 2
        "product_quality": (0.15, 0.72, 0.18),
        "refunds_returns": (0.07, 0.64, 0.21),
        "delivery_speed": (0.28, 0.45, 0.42),
        "customer_support": (0.09, 0.28, 0.58),
    },
    "minutemart": {
        "app_experience": (0.12, 0.70, 0.16),  # before 5.2.0; collapses after, see _profile()
        "payments": (0.07, 0.40, 0.46),
        "customer_support": (0.09, 0.20, 0.66),
    },
}

# App version release timelines: (version, days before end date)
VERSIONS = {
    "dashly": [("3.8.0", 380), ("3.9.0", 300), ("3.10.0", 230), ("3.11.0", 160), ("3.12.0", 95), ("3.13.0", 30)],
    "kwikr": [("12.1.0", 375), ("12.2.0", 280), ("12.3.0", 200), ("12.4.0", 120), ("12.5.0", 55)],
    "basketo": [("7.0.3", 390), ("7.1.0", 290), ("7.2.0", 190), ("7.3.0", 110), ("7.4.0", 40)],
    "minutemart": [("5.0.0", 385), ("5.0.4", 300), ("5.1.0", 210), ("5.1.2", 150), ("5.2.0", 114), ("5.2.1", 80), ("5.3.0", 35)],
}
MINUTEMART_BAD_FROM = (5, 2, 0)

# Off-taxonomy complaint themes (signal 5, for topic discovery): weight per competitor
OTHER_THEME_WEIGHT = {
    "other:rider_behaviour": {"dashly": 0.05, "kwikr": 0.03, "basketo": 0.02, "minutemart": 0.04},
    "other:serviceability": {"dashly": 0.015, "kwikr": 0.02, "basketo": 0.015, "minutemart": 0.025},
    "other:packaging_waste": {"dashly": 0.015, "kwikr": 0.015, "basketo": 0.02, "minutemart": 0.01},
}

REFUND_RAMP_DAYS = 90  # signal 1: Kwikr refund complaints ramp over the last 90 days


@dataclass
class DemoReview:
    external_key: str
    competitor: str
    text: str
    rating: int
    reviewed_at: str  # ISO 8601 UTC
    app_version: str | None
    source: str = "demo"


@dataclass
class GroundTruth:
    external_key: str
    language: str  # en | hinglish | hi
    overall: str  # positive | neutral | negative
    aspects: list[dict] = field(default_factory=list)  # [{"aspect": key, "sentiment": label}]
    is_duplicate: bool = False
    is_spam: bool = False


def _vtuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in v.split("."))


def _profile(comp: str, aspect: str, days_before_end: int, version: str | None) -> tuple[float, float, float]:
    w, pos, neg = OVERRIDES.get(comp, {}).get(aspect, MARKET_BASELINE[aspect])
    if comp == "kwikr" and aspect == "refunds_returns" and days_before_end < REFUND_RAMP_DAYS:
        f = (1 - days_before_end / REFUND_RAMP_DAYS) ** 1.6  # 0 → 1 across the final 90 days, accelerating
        w = 0.06 + 0.54 * f
        neg = 0.45 + 0.50 * f
        pos = max(0.02, 0.40 - 0.38 * f)
    if comp == "minutemart" and aspect == "app_experience" and version and _vtuple(version) >= MINUTEMART_BAD_FROM:
        w, pos, neg = 0.32, 0.10, 0.82
    return w, pos, neg


def _volume_multiplier(comp: str, month_index: int, days_before_end: int) -> float:
    m = 1 + 0.02 * month_index
    if comp == "kwikr" and days_before_end < REFUND_RAMP_DAYS:
        m *= 1 + 0.6 * (1 - days_before_end / REFUND_RAMP_DAYS)
    return m


class _Gen:
    def __init__(self, seed: int, end: date):
        self.r = random.Random(seed)
        self.end = end
        self.start = end - timedelta(days=365)

    # ── small helpers ──
    def pick(self, xs):
        return xs[self.r.randrange(len(xs))]

    def fill(self, tpl: str, comp: str) -> str:
        item = self.pick(T.ITEMS)
        item2 = self.pick([i for i in T.ITEMS if i != item])
        return tpl.format(
            item=item, item2=item2, mins=self.pick(T.MINS), late=self.pick(T.LATE), amt=self.pick(T.AMOUNTS),
            days=self.pick(T.DAYS), months=self.pick(T.MONTHS), brand=BRAND[comp],
        )

    def version_for(self, comp: str, d: date) -> str | None:
        if self.r.random() < 0.10:
            return None  # not every review records an app version
        released = [v for v, ago in VERSIONS[comp] if self.end - timedelta(days=ago) <= d]
        if not released:
            return VERSIONS[comp][0][0]
        x = self.r.random()
        if x < 0.78 or len(released) == 1:
            return released[-1]
        if x < 0.95 or len(released) == 2:
            return released[-2]
        return released[-3]

    def sentiment(self, pos: float, neg: float) -> str:
        x = self.r.random()
        return "positive" if x < pos else "negative" if x < pos + neg else "neutral"

    # ── text building ──
    def noisify(self, text: str, overall: str) -> str:
        r = self.r
        if r.random() < 0.18:
            words = text.split(" ")
            for _ in range(r.choice([1, 1, 2])):
                i = r.randrange(len(words))
                w = words[i]
                if len(w) > 4 and w.isalpha():
                    j = r.randrange(1, len(w) - 2)
                    op = r.random()
                    if op < 0.4:
                        w = w[:j] + w[j + 1] + w[j] + w[j + 2 :]  # swap
                    elif op < 0.7:
                        w = w[:j] + w[j + 1 :]  # drop
                    else:
                        w = w[:j] + w[j] + w[j:]  # double
                    words[i] = w
            text = " ".join(words)
        if r.random() < 0.12:
            text = " ".join(T.CHAT_SPEAK.get(w.lower(), w) for w in text.split(" "))
        if r.random() < 0.22:
            text = text.lower()
        elif overall == "negative" and r.random() < 0.05:
            text = text.upper()
        if r.random() < 0.10:
            text = text.rstrip(".") + r.choice(["!!!", "...", "!!", "??", " !!"])
        if r.random() < 0.20:
            text = text + " " + self.pick(T.EMOJI[overall]) * r.choice([1, 1, 2, 3])
        if r.random() < 0.04:
            text = "  " + text.replace(" ", "  ", 1) + "\n"
        return text

    def join(self, parts: list[tuple[str, str]]) -> str:
        out = parts[0][0]
        out = out[0].upper() + out[1:]
        for (prev_text, prev_s), (txt, s) in zip(parts, parts[1:]):
            sep = self.pick(T.CONTRAST) if (prev_s != s and "neutral" not in (prev_s, s)) else self.pick(T.SAME)
            if sep.strip().endswith(".") or sep.startswith("."):
                txt = txt[0].upper() + txt[1:]
            out += sep + txt
        return out + ("." if self.r.random() < 0.6 else "")

    def overall_from(self, sentiments: list[str]) -> str:
        if not sentiments:
            return "neutral"
        s = sum(1 if x == "positive" else -1 if x == "negative" else 0 for x in sentiments) / len(sentiments)
        return "positive" if s > 0.25 else "negative" if s < -0.25 else "neutral"

    def rating_from(self, overall: str, sentiments: list[str]) -> int:
        r = self.r
        if sentiments:
            s = sum(1 if x == "positive" else -1 if x == "negative" else 0 for x in sentiments) / len(sentiments)
        else:
            s = {"positive": 0.9, "negative": -0.9, "neutral": 0.0}[overall]
        if r.random() < 0.03:  # rating/text mismatch happens in real data
            return r.choice([1, 5])
        return max(1, min(5, round(3 + 2 * s + r.gauss(0, 0.55))))

    # ── one review ──
    def review(self, comp: str, d: date, idx: int) -> tuple[DemoReview, GroundTruth]:
        r = self.r
        days_before_end = (self.end - d).days
        version = self.version_for(comp, d)
        lang_roll = r.random()
        language = "en" if lang_roll >= 0.08 else ("hinglish" if lang_roll < 0.06 else "hi")

        n_aspects = r.choices([0, 1, 2, 3], weights=[18, 45, 27, 10])[0]
        aspects = list(MARKET_BASELINE)
        weights = [_profile(comp, a, days_before_end, version)[0] for a in aspects]
        chosen: list[str] = []
        for _ in range(n_aspects):
            a = r.choices(aspects, weights=weights)[0]
            if a not in chosen:
                chosen.append(a)
        labelled = []
        for a in chosen:
            _, pos, neg = _profile(comp, a, days_before_end, version)
            labelled.append((a, self.sentiment(pos, neg)))
        for theme, w in OTHER_THEME_WEIGHT.items():
            if r.random() < w[comp]:
                labelled.insert(r.randrange(len(labelled) + 1), (theme, "negative"))

        if language == "en":
            text, overall = self.english_text(comp, labelled)
        elif language == "hinglish":
            labelled = [(a, s) for a, s in labelled if a in T.HINGLISH and s != "neutral"][:2]  # drops other: themes
            text, overall = self.hinglish_text(comp, labelled)
        else:
            overall = r.choice(["positive", "negative", "negative", "neutral"])
            text = self.pick(T.DEVANAGARI[overall])
            labelled = T.DEVANAGARI_ASPECT.get(text, [])

        rating = self.rating_from(overall, [s for _, s in labelled])
        ts = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(seconds=r.randrange(6 * 3600, 24 * 3600))
        key = f"demo-{idx:05d}"
        return (
            DemoReview(key, comp, text, rating, ts.isoformat().replace("+00:00", "Z"), version),
            GroundTruth(key, language, overall, [{"aspect": a, "sentiment": s} for a, s in labelled]),
        )

    def english_text(self, comp: str, labelled: list[tuple[str, str]]) -> tuple[str, str]:
        r = self.r
        if not labelled:
            overall = r.choices(["positive", "negative", "neutral"], weights=[45, 35, 20])[0]
            text = self.pick(T.GENERIC[overall])
            if r.random() < 0.25:
                text = self.fill(self.pick(T.OPENERS), comp) + " " + text[0].upper() + text[1:] + "."
            return self.noisify(text, overall), overall
        parts = [
            (self.fill(self.pick(T.OTHER_THEMES[a] if a.startswith("other:") else T.PHRASES[a][s]), comp), s)
            for a, s in labelled
        ]
        overall = self.overall_from([s for _, s in labelled])
        text = self.join(parts)
        if r.random() < 0.22:
            text = self.fill(self.pick(T.OPENERS), comp) + " " + text
        if r.random() < 0.25:
            closers = {"positive": T.CLOSERS_POS, "negative": T.CLOSERS_NEG, "neutral": T.CLOSERS_NEU}[overall]
            text = text.rstrip() + ("" if text.rstrip().endswith((".", "!", "?")) else ".") + " " + self.fill(self.pick(closers), comp)
        return self.noisify(text, overall), overall

    def hinglish_text(self, comp: str, labelled: list[tuple[str, str]]) -> tuple[str, str]:
        if not labelled:
            overall = self.r.choice(["positive", "negative", "neutral"])
            return self.pick(T.HINGLISH_GENERIC[overall]), overall
        parts = [self.fill(self.pick(T.HINGLISH[a][s]), comp) for a, s in labelled]
        overall = self.overall_from([s for _, s in labelled])
        sep = " lekin " if len({s for _, s in labelled}) > 1 else " aur "
        text = sep.join(parts)
        if self.r.random() < 0.4:
            text += " " + self.pick(T.HINGLISH_GENERIC[overall])
        return self.noisify(text, overall), overall

    def spam(self, comp: str, d: date, idx: int) -> tuple[DemoReview, GroundTruth]:
        r = self.r
        code = "".join(r.choice("abcdefghjkmnpqrstuvwxyz23456789") for _ in range(6))
        text = self.pick(T.SPAM).format(code=code, digits="".join(str(r.randrange(10)) for _ in range(8)))
        ts = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(seconds=r.randrange(86400))
        key = f"demo-{idx:05d}"
        return (
            DemoReview(key, comp, text, r.choice([1, 5, 5]), ts.isoformat().replace("+00:00", "Z"), None),
            GroundTruth(key, "en", "neutral", [], is_spam=True),
        )


def generate(seed: int = DEFAULT_SEED, end_date: date = DEFAULT_END_DATE) -> tuple[list[DemoReview], list[GroundTruth]]:
    g = _Gen(seed, end_date)
    reviews: list[DemoReview] = []
    truth: list[GroundTruth] = []
    idx = 0
    day = g.start + timedelta(days=1)
    while day <= end_date:
        month_index = min(MONTHS_OF_DATA - 1, (day - g.start).days * MONTHS_OF_DATA // 366)
        days_before_end = (end_date - day).days
        weekend = 1.15 if day.weekday() >= 5 else 1.0
        for comp in COMPETITORS:
            expected = BASE_MONTHLY_VOLUME[comp] / 30.4 * _volume_multiplier(comp, month_index, days_before_end) * weekend
            n = int(expected) + (1 if g.r.random() < expected - int(expected) else 0)
            for _ in range(n):
                if g.r.random() < 0.01:
                    rv, gt = g.spam(comp, day, idx)
                else:
                    rv, gt = g.review(comp, day, idx)
                reviews.append(rv)
                truth.append(gt)
                idx += 1
                if g.r.random() < 0.02:  # duplicate submissions (exact or near-exact), same day
                    text = rv.text if g.r.random() < 0.5 else "  " + rv.text.upper().rstrip(".!") + "!!"
                    dup = DemoReview(f"demo-{idx:05d}", comp, text, rv.rating, rv.reviewed_at, rv.app_version)
                    reviews.append(dup)
                    truth.append(GroundTruth(dup.external_key, gt.language, gt.overall, gt.aspects, is_duplicate=True))
                    idx += 1
        day += timedelta(days=1)
    return reviews, truth


def write(out_dir: Path, seed: int = DEFAULT_SEED, end_date: date = DEFAULT_END_DATE) -> dict:
    reviews, truth = generate(seed, end_date)
    out_dir.mkdir(parents=True, exist_ok=True)
    rpath, tpath = out_dir / "demo_reviews.jsonl", out_dir / "demo_ground_truth.jsonl"
    with rpath.open("w", encoding="utf-8", newline="\n") as f:
        for rv in reviews:
            f.write(json.dumps(asdict(rv), ensure_ascii=False) + "\n")
    with tpath.open("w", encoding="utf-8", newline="\n") as f:
        for gt in truth:
            f.write(json.dumps(asdict(gt), ensure_ascii=False) + "\n")
    digest = hashlib.sha256(rpath.read_bytes()).hexdigest()[:16]
    meta = {"seed": seed, "end_date": end_date.isoformat(), "reviews": len(reviews), "sha256_16": digest}
    (out_dir / "demo_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta

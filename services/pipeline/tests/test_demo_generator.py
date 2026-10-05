"""The demo generator must be deterministic and contain the planted signals in its ground truth."""

from collections import Counter
from datetime import date, datetime, timedelta

from pipeline.providers.demo.generator import DEFAULT_END_DATE, DEFAULT_SEED, generate, write


def test_same_seed_gives_identical_output(tmp_path):
    a = write(tmp_path / "a")
    b = write(tmp_path / "b")
    assert a["sha256_16"] == b["sha256_16"]
    assert (tmp_path / "a" / "demo_reviews.jsonl").read_bytes() == (tmp_path / "b" / "demo_reviews.jsonl").read_bytes()


def test_different_seed_gives_different_output(tmp_path):
    a = write(tmp_path / "a", seed=1)
    b = write(tmp_path / "b", seed=2)
    assert a["sha256_16"] != b["sha256_16"]


def test_volume_languages_and_noise():
    reviews, truth = generate()
    assert 5500 <= len(reviews) <= 7500
    assert {r.competitor for r in reviews} == {"dashly", "kwikr", "basketo", "minutemart"}
    langs = Counter(t.language for t in truth)
    assert 0.05 <= (langs["hinglish"] + langs["hi"]) / len(truth) <= 0.11  # ~8% Hinglish/Hindi
    assert sum(t.is_duplicate for t in truth) > 50 and sum(t.is_spam for t in truth) > 20
    assert {r.rating for r in reviews} == {1, 2, 3, 4, 5}
    lengths = [len(r.text.split()) for r in reviews]
    assert min(lengths) <= 2 and max(lengths) >= 30


def _neg_share(reviews, truth, comp, aspect, d0, d1):
    end = datetime(DEFAULT_END_DATE.year, DEFAULT_END_DATE.month, DEFAULT_END_DATE.day, 23, 59)
    n = neg = 0
    for r, t in zip(reviews, truth):
        if r.competitor != comp or t.is_duplicate or t.is_spam or t.language != "en":
            continue
        age = (end - datetime.fromisoformat(r.reviewed_at.replace("Z", ""))).days
        if d0 <= age < d1:
            n += 1
            neg += any(a["aspect"] == aspect and a["sentiment"] == "negative" for a in t.aspects)
    return neg / n


def test_planted_signals_present_in_ground_truth():
    reviews, truth = generate(DEFAULT_SEED, DEFAULT_END_DATE)
    # 1. Kwikr refund complaints rise steadily over the last 3 months
    s = [_neg_share(reviews, truth, "kwikr", "refunds_returns", a, a + 30) for a in (0, 30, 60, 90)]
    assert s[0] > s[1] > s[2] > s[3]
    # 3. customer support weak for everyone (more negative than positive everywhere)
    for comp in ("dashly", "kwikr", "basketo", "minutemart"):
        c = Counter(a["sentiment"] for r, t in zip(reviews, truth) if r.competitor == comp for a in t.aspects if a["aspect"] == "customer_support")
        assert c["negative"] > c["positive"]
    # 4. MinuteMart app experience collapses from version 5.2.0
    before, after = Counter(), Counter()
    for r, t in zip(reviews, truth):
        if r.competitor == "minutemart" and r.app_version:
            bucket = after if tuple(map(int, r.app_version.split("."))) >= (5, 2, 0) else before
            for a in t.aspects:
                if a["aspect"] == "app_experience":
                    bucket[a["sentiment"]] += 1
    assert after["negative"] / sum(after.values()) > 0.6 > before["negative"] / sum(before.values())


def test_end_date_controls_window():
    reviews, _ = generate(DEFAULT_SEED, date(2025, 1, 31))
    last = max(r.reviewed_at for r in reviews)
    assert last.startswith("2025-01-31")
    assert (date(2025, 1, 31) - timedelta(days=366)).isoformat() <= min(r.reviewed_at for r in reviews)[:10]

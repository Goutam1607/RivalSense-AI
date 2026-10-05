"""Unit tests for cleaning, language detection, clause splitting and the aspect lexicon."""

from datetime import datetime

from pipeline.config import market_config
from pipeline.steps.aspects import AspectDef, Lexicon, prototypes
from pipeline.steps.clauses import split_clauses
from pipeline.steps.clean import clean_and_dedupe, clean_text, content_hash, is_spam, normalise_for_hash
from pipeline.steps.language import detect_language


# ── clean ──
def test_clean_strips_html_control_and_repeated_punctuation_but_keeps_emoji():
    assert clean_text("  <b>Great</b>&amp; fast!!!!  delivery 😊\n\n") == "Great & fast! delivery 😊"
    assert clean_text("bad​ app\x07") == "bad app"
    assert clean_text("wait.......") == "wait..."
    assert clean_text("") == ""


def test_hash_ignores_case_punctuation_and_whitespace():
    assert normalise_for_hash("  REFUND not received!! ") == normalise_for_hash("refund not received")
    assert content_hash("Nice app", "GOOGLE_PLAY", "2026-09-01") != content_hash("Nice app", "GOOGLE_PLAY", "2026-09-02")


def test_spam_rules():
    assert is_spam("Use my referral code ABC123 for free cash")
    assert is_spam("call 9812345678 for loan")
    assert is_spam("good good good good good good good")
    assert is_spam("visit www.win.xyz")
    assert not is_spam("delivery in 10 minutes, great service")
    assert not is_spam("good good app")


def test_dedupe_keeps_first_and_ignores_short_generic_texts():
    d = datetime(2026, 9, 1, 10)
    rows = [
        {"id": "1", "external_key": "a", "competitor_id": "c", "source": "S", "reviewed_at": d, "text": "Refund not received after a week"},
        {"id": "2", "external_key": "b", "competitor_id": "c", "source": "S", "reviewed_at": d, "text": "REFUND NOT RECEIVED after a week!!"},
        {"id": "3", "external_key": "c", "competitor_id": "c2", "source": "S", "reviewed_at": d, "text": "Refund not received after a week"},
        {"id": "4", "external_key": "d", "competitor_id": "c", "source": "S", "reviewed_at": d, "text": "good"},
        {"id": "5", "external_key": "e", "competitor_id": "c", "source": "S", "reviewed_at": d, "text": "Good!"},
    ]
    out = clean_and_dedupe(rows)
    assert out["1"].status is None
    assert out["2"].status == "DUPLICATE"
    assert out["3"].status is None  # different competitor
    assert out["4"].status is None and out["5"].status is None  # too short to call duplicates


# ── language ──
def test_language_detection():
    assert detect_language("The app keeps crashing at checkout and support is useless") == "en"
    assert detect_language("Nice") == "en"
    assert detect_language("delivery bahut late aayi") == "hinglish"
    assert detect_language("paisa wapas nahi mila abhi tak") == "hinglish"
    assert detect_language("बहुत खराब सर्विस") == "hi"
    assert detect_language("👍👍") == "und"
    assert detect_language("to be honest the delivery is slow") == "en"  # 'to' alone is not Hinglish


# ── clauses ──
def test_clause_splitting_on_contrast_markers():
    c = [x.text for x in split_clauses("Delivery was fast but the refund took three days")]
    assert c == ["Delivery was fast", "the refund took three days"]
    c = [x.text for x in split_clauses("fast delivery; however, prices are high although offers are nice")]
    assert c == ["fast delivery;", "prices are high", "offers are nice"]


def test_clause_splitting_keeps_decimals_and_offsets():
    text = "Waited 1.5 hours. Rs. 650 charged! Never again"
    clauses = split_clauses(text)
    assert [x.text for x in clauses] == ["Waited 1.5 hours.", "Rs. 650 charged!", "Never again"]
    for c in clauses:
        assert text[c.start : c.end] == c.text


def test_short_fragments_are_merged():
    assert [x.text for x in split_clauses("Good app though")] == ["Good app"]
    assert len(split_clauses("Nice")) == 1


def test_no_split_inside_words():
    assert len(split_clauses("The butter was fresh")) == 1


# ── aspect lexicon ──
def _aspects():
    return [AspectDef(a["key"], a["key"], a["label"], a["query"], a["description"], tuple(a["seedKeywords"])) for a in market_config()["aspects"]]


def test_lexicon_matches_with_word_boundaries():
    lex = Lexicon(_aspects())
    assert set(lex.match("refund not received yet")) == {"refunds_returns"}
    assert set(lex.match("delivery fee is too high")) == {"pricing"}
    assert "delivery_speed" in lex.match("got my order in 10 minutes")
    assert "payments" in lex.match("UPI payment failed but money deducted")
    assert lex.match("I love chocolate") == {}  # 'late' must not match inside 'chocolate'
    assert "customer_support" in lex.match("customer care never replied")


def test_lexicon_records_offsets():
    lex = Lexicon(_aspects())
    m = lex.match("They sent the wrong item again")["order_accuracy"]
    assert "They sent the wrong item again"[m.start() : m.end()].lower() == "wrong item"


def test_prototypes_from_description():
    a = _aspects()[0]
    p = prototypes(a)
    assert p[0] == a.label and len(p) > 2

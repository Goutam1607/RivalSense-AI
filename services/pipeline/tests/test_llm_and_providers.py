"""LLM number validator, provider selection, CSV provider and topic keyword extraction."""

import os

from pipeline.llm import NoneProvider, get_provider, numbers_in, rewrite_validated, validate_rewrite
from pipeline.providers.csv_provider import CsvProvider
from pipeline.steps.topics import c_tf_idf_keywords

FACTS = {"competitor": "Kwikr", "recent_share_pct": "17.9", "previous_share_pct": "8.1", "recent_negative": 35, "p_value": "p = 0.006"}
TEMPLATE = "Negative refunds mentions for Kwikr rose from 8.1% to 17.9% (35 of 196), p = 0.006."


def test_numbers_extracted():
    assert numbers_in("rose from 8.1% to 17.9% (35 of 1,196)") == {"8.1", "17.9", "35", "1196"}


def test_validator_accepts_reworded_text_with_same_numbers():
    ok, _ = validate_rewrite(TEMPLATE, FACTS, "Kwikr's refund complaints climbed from 8.1% to 17.9% of reviews (35 of 196; p = 0.006).")
    assert ok


def test_validator_rejects_new_numbers():
    ok, reason = validate_rewrite(TEMPLATE, FACTS, "Kwikr's refund complaints more than doubled to 18% and will reach 30% next month.")
    assert not ok and "18" in reason


def test_validator_rejects_empty_or_runaway_output():
    assert not validate_rewrite(TEMPLATE, FACTS, "")[0]
    assert not validate_rewrite(TEMPLATE, FACTS, "x " * 1000)[0]


class _Fake:
    name = "fake:model"

    def __init__(self, out):
        self.out = out

    def rewrite(self, statement, facts):
        return self.out


def test_rewrite_falls_back_to_template_when_invalid():
    assert rewrite_validated(_Fake("Complaints hit 99%."), TEMPLATE, FACTS) == (None, "template")
    text, by = rewrite_validated(_Fake("Refund complaints for Kwikr rose from 8.1% to 17.9%."), TEMPLATE, FACTS)
    assert by == "fake:model" and text.startswith("Refund")
    assert rewrite_validated(NoneProvider(), TEMPLATE, FACTS) == (None, "template")


def test_provider_defaults_to_none_without_keys(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    assert isinstance(get_provider(), NoneProvider)
    monkeypatch.setenv("LLM_PROVIDER", "none")
    assert isinstance(get_provider(), NoneProvider)
    assert os.environ["LLM_PROVIDER"] == "none"


def test_csv_provider_with_mapping(tmp_path):
    p = tmp_path / "r.csv"
    p.write_text("app_name,content,score,at,userName\nShopA,Great app,5,2026-01-02,alice\nShopB,Slow delivery,2,2026-01-03,bob\n", encoding="utf-8")
    prov = CsvProvider(str(p), "test-market", '{"competitor": "app_name", "text": "content", "rating": "score", "date": "at"}')
    assert {c.slug for c in prov.competitors()} == {"shopa", "shopb"}
    rows = list(prov.iter_reviews())
    assert [r.rating for r in rows] == [5, 2]
    assert all("alice" not in r.text and "bob" not in r.text for r in rows)  # user names are never read
    assert rows[0].external_key != rows[1].external_key


def test_ctfidf_keywords_do_not_span_clauses():
    kws = c_tf_idf_keywords({0: ["rider was rude", "rude rider again", "the rider shouted"], 1: ["too much plastic", "plastic bags everywhere", "plastic waste"]})
    assert "plastic" in kws[1][0] or "plastic" in kws[1]
    assert not any("rude plastic" in k or "again plastic" in k for k in kws[0] + kws[1])

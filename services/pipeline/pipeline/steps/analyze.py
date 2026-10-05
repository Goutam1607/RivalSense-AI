"""Steps 2–7 in memory: clean → language → clauses → aspects → aspect sentiment → overall sentiment.

Input: review rows from the database. Output: an AnalysisResult with everything the
persist step writes. Offsets for highlighting are relative to review.clean_text.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field

from pipeline.config import PARAMS, Params
from pipeline.steps.aspects import AspectDef, EmbeddingMatcher, Lexicon, detect
from pipeline.steps.clauses import Clause, split_clauses
from pipeline.steps.clean import clean_and_dedupe
from pipeline.steps.language import SUPPORTED_LANGUAGES, detect_language

log = logging.getLogger("pipeline.analyze")


@dataclass
class ClauseOut:
    id: str
    review_id: str
    position: int
    text: str
    start: int
    end: int
    sentiment: str | None = None
    confidence: float | None = None


@dataclass
class MentionOut:
    id: str
    review_id: str
    clause_id: str
    aspect_key: str
    sentiment: str
    confidence: float
    layer: str
    matched_text: str | None
    match_start: int | None
    match_end: int | None
    similarity: float | None


@dataclass
class ReviewOut:
    id: str
    clean_text: str
    content_hash: str
    language: str
    status: str
    sentiment: str | None = None
    confidence: float | None = None
    probs: tuple[float, float, float] | None = None  # negative, neutral, positive


@dataclass
class AnalysisResult:
    reviews: dict[str, ReviewOut]
    clauses: list[ClauseOut]
    mentions: list[MentionOut]
    clause_vectors: object  # np.ndarray aligned with `clauses`
    counts: dict = field(default_factory=dict)
    timings: dict = field(default_factory=dict)
    models: dict = field(default_factory=dict)


def analyse(rows: list[dict], aspects: list[AspectDef], params: Params = PARAMS) -> AnalysisResult:
    from pipeline.steps.models import AspectSentiment, Embedder, OverallSentiment

    t0 = time.perf_counter()
    timings: dict[str, float] = {}
    counts: Counter = Counter()
    counts["reviews_total"] = len(rows)

    # ── 2. clean + dedupe + spam ──
    cleaned = clean_and_dedupe(rows)
    out: dict[str, ReviewOut] = {}
    for r in rows:
        c = cleaned[r["id"]]
        out[r["id"]] = ReviewOut(r["id"], c.clean_text, c.content_hash, "und", c.status or "PENDING")
    counts["duplicates"] = sum(1 for o in out.values() if o.status == "DUPLICATE")
    counts["spam"] = sum(1 for o in out.values() if o.status == "SPAM")
    timings["clean"] = time.perf_counter() - t0

    # ── 3. language ──
    t = time.perf_counter()
    lang_counts: Counter = Counter()
    for o in out.values():
        o.language = detect_language(o.clean_text)
        if o.status == "PENDING":
            lang_counts[o.language] += 1
            o.status = "ANALYSED" if o.language in SUPPORTED_LANGUAGES else "NOT_ANALYSED_LANGUAGE"
    counts["languages"] = dict(lang_counts)
    counts["analysed"] = sum(1 for o in out.values() if o.status == "ANALYSED")
    counts["not_analysed_language"] = sum(1 for o in out.values() if o.status == "NOT_ANALYSED_LANGUAGE")
    timings["language"] = time.perf_counter() - t
    log.info("Cleaned %d reviews: %d duplicates, %d spam, %d English (analysed), %d other languages",
             len(rows), counts["duplicates"], counts["spam"], counts["analysed"], counts["not_analysed_language"])

    analysed = [o for o in out.values() if o.status == "ANALYSED"]

    # ── 4. clauses ──
    t = time.perf_counter()
    clauses: list[ClauseOut] = []
    for o in analysed:
        for c in split_clauses(o.clean_text):
            clauses.append(ClauseOut(str(uuid.uuid4()), o.id, c.position, c.text, c.start, c.end))
    counts["clauses"] = len(clauses)
    timings["clauses"] = time.perf_counter() - t

    # ── 5. aspects (lexicon + embeddings) ──
    t = time.perf_counter()
    embedder = Embedder()
    vecs = embedder.encode([c.text for c in clauses], desc="clause embeddings")
    lexicon = Lexicon(aspects)
    matcher = EmbeddingMatcher(aspects, embedder, params.embedding_threshold, params.embedding_margin)
    sims = matcher.similarities(vecs) if len(clauses) else None
    detections = []  # (clause index, Detection)
    for i, c in enumerate(clauses):
        for d in detect(c.text, lexicon, sims[i] if sims is not None else None, matcher):
            detections.append((i, d))
    counts["aspect_detections"] = len(detections)
    counts["detections_by_layer"] = dict(Counter(d.layer for _, d in detections))
    timings["aspects"] = time.perf_counter() - t
    log.info("Aspect detection: %d detections in %d clauses (%s)", len(detections), len(clauses),
             counts["detections_by_layer"])

    # ── 7 (+ clause-level). overall sentiment per review, and per clause ──
    t = time.perf_counter()
    overall = OverallSentiment()
    review_texts = [o.clean_text for o in analysed]
    clause_texts = [c.text for c in clauses]
    preds = overall.predict(review_texts + clause_texts, desc="overall + clause sentiment")
    for o, p in zip(analysed, preds[: len(analysed)]):
        o.sentiment, o.confidence, o.probs = p.label, p.confidence, p.probs
    for c, p in zip(clauses, preds[len(analysed):]):
        c.sentiment, c.confidence = p.label, p.confidence
    timings["overall_sentiment"] = time.perf_counter() - t

    # ── 6. aspect sentiment (ABSA on lexicon/both; clause sentiment fallback for embedding-only) ──
    t = time.perf_counter()
    absa = AspectSentiment()
    by_key = {a.key: a for a in aspects}
    # The ABSA model reads the whole *sentence* around the clause: it is trained to separate aspects
    # inside contrastive sentences ("fast delivery but the refund took 3 days"), and cutting at "but"
    # can drop the part that carries the sentiment ("refund was processed | but I never got the money").
    sentences = {o.id: sentence_spans(o.clean_text) for o in analysed}
    pairs, pair_idx = [], []
    for j, (i, d) in enumerate(detections):
        if d.layer in ("LEXICON", "BOTH"):
            c = clauses[i]
            text = out[c.review_id].clean_text
            s0, s1 = next(((a, b) for a, b in sentences[c.review_id] if a <= c.start < b), (c.start, c.end))
            pairs.append((text[s0:max(s1, c.end)], d.matched_text or by_key[d.aspect_key].query))
            pair_idx.append(j)
    absa_preds = dict(zip(pair_idx, absa.predict(pairs, desc="aspect sentiment (ABSA)"))) if pairs else {}
    timings["aspect_sentiment"] = time.perf_counter() - t

    # one mention per (review, aspect): keep the most confident clause-level reading
    best: dict[tuple[str, str], MentionOut] = {}
    for j, (i, d) in enumerate(detections):
        c = clauses[i]
        if j in absa_preds:
            label, conf = absa_preds[j].label, absa_preds[j].confidence
        else:
            label, conf = c.sentiment or "NEUTRAL", c.confidence or 0.0
        m = MentionOut(
            str(uuid.uuid4()), c.review_id, c.id, d.aspect_key, label, conf, d.layer, d.matched_text,
            c.start + d.match_start if d.match_start is not None else None,
            c.start + d.match_end if d.match_end is not None else None,
            d.similarity,
        )
        k = (c.review_id, d.aspect_key)
        if k not in best or m.confidence > best[k].confidence:
            best[k] = m
    mentions = list(best.values())
    counts["aspect_mentions"] = len(mentions)
    counts["mentions_by_sentiment"] = dict(Counter(m.sentiment for m in mentions))
    timings["total"] = time.perf_counter() - t0

    models = {
        "overall_sentiment": {"name": overall.repo, "revision": overall.revision},
        "absa": {"name": absa.repo, "revision": absa.revision},
        "embeddings": {"name": embedder.repo, "revision": embedder.revision},
        "aspect_detection": {"lexicon": "config/markets seed keywords", "embedding_threshold": params.embedding_threshold,
                             "embedding_margin": params.embedding_margin},
    }
    return AnalysisResult(out, clauses, mentions, vecs, dict(counts), {k: round(v, 2) for k, v in timings.items()}, models)


_SENTENCE_END = re.compile(r"(?<!\brs)(?<!\bno)(?<!\d)[.!?]+(?=\s|$)|\n", re.IGNORECASE)


def sentence_spans(text: str) -> list[tuple[int, int]]:
    """Character spans of sentences (boundaries: . ! ? newline), used as ABSA context."""
    spans, start = [], 0
    for m in _SENTENCE_END.finditer(text):
        spans.append((start, m.end()))
        start = m.end()
    spans.append((start, len(text)))
    return [(a, b) for a, b in spans if text[a:b].strip()]


def aspect_defs_from_db(rows: list[dict], query_terms: dict[str, str]) -> list[AspectDef]:
    return [AspectDef(str(r["id"]), r["key"], r["label"], query_terms.get(r["key"], r["label"].lower()),
                      r["description"], tuple(r["seed_keywords"] or [])) for r in rows]


_ = Clause  # re-exported for type users

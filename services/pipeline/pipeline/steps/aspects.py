"""Step 5 — aspect detection, two layers (CLAUDE.md §6.5).

(a) Lexicon: seed keywords per category, word-boundary regex — high precision.
(b) Embeddings: cosine similarity between the clause and short prototype phrases
    derived from each category's description — adds recall for paraphrases
    ("my groceries showed up before I finished my tea" → delivery_speed).

The layer that fired is recorded (LEXICON, EMBEDDING, or BOTH).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class AspectDef:
    id: str
    key: str
    label: str
    query: str  # short aspect term handed to the ABSA model when the embedding layer fired
    description: str
    seed_keywords: tuple[str, ...]


@dataclass
class Detection:
    aspect_key: str
    layer: str  # LEXICON | EMBEDDING | BOTH
    matched_text: str | None
    match_start: int | None  # offsets into the clause
    match_end: int | None
    similarity: float | None


class Lexicon:
    def __init__(self, aspects: list[AspectDef]):
        self.patterns: dict[str, re.Pattern] = {}
        for a in aspects:
            kws = sorted({k.lower() for k in a.seed_keywords}, key=len, reverse=True)
            if kws:
                alt = "|".join(re.escape(k).replace(r"\ ", r"\s+") for k in kws)
                self.patterns[a.key] = re.compile(rf"(?<![\w-])(?:{alt})(?![\w-])", re.IGNORECASE)

    def match(self, clause: str) -> dict[str, re.Match]:
        found = {}
        for key, rx in self.patterns.items():
            m = rx.search(clause)
            if m:
                found[key] = m
        return found


def prototypes(a: AspectDef) -> list[str]:
    """Short phrases describing the category: its label plus each comma/‘or’-separated part of the description."""
    parts = re.split(r",|\bor\b|\band\b", a.description)
    phrases = [a.label] + [p.strip(" .") for p in parts if len(p.strip().split()) >= 2]
    return list(dict.fromkeys(phrases))


class EmbeddingMatcher:
    def __init__(self, aspects: list[AspectDef], embedder, threshold: float, margin: float):
        self.keys: list[str] = []
        texts: list[str] = []
        for a in aspects:
            for p in prototypes(a):
                self.keys.append(a.key)
                texts.append(p)
        self.proto = embedder.encode(texts, desc="aspect prototypes")
        self.aspect_keys = [a.key for a in aspects]
        self.threshold = threshold
        self.margin = margin

    def similarities(self, clause_vecs: np.ndarray) -> np.ndarray:
        """Returns (n_clauses, n_aspects) max similarity per category."""
        sims = clause_vecs @ self.proto.T
        out = np.full((clause_vecs.shape[0], len(self.aspect_keys)), -1.0, dtype=np.float32)
        for j, key in enumerate(self.keys):
            col = self.aspect_keys.index(key)
            out[:, col] = np.maximum(out[:, col], sims[:, j])
        return out

    def best(self, sim_row: np.ndarray) -> tuple[str, float] | None:
        order = np.argsort(-sim_row)
        top, second = float(sim_row[order[0]]), float(sim_row[order[1]]) if len(order) > 1 else -1.0
        if top >= self.threshold and top - second >= self.margin:
            return self.aspect_keys[int(order[0])], top
        return None


def detect(clause: str, lexicon: Lexicon, sim_row: np.ndarray | None, matcher: EmbeddingMatcher | None) -> list[Detection]:
    found = lexicon.match(clause)
    dets = [Detection(k, "LEXICON", m.group(0), m.start(), m.end(), None) for k, m in found.items()]
    if sim_row is not None and matcher is not None:
        best = matcher.best(sim_row)
        if best:
            key, sim = best
            existing = next((d for d in dets if d.aspect_key == key), None)
            if existing:
                existing.layer = "BOTH"
                existing.similarity = sim
            else:
                dets.append(Detection(key, "EMBEDDING", None, None, None, sim))
    return dets

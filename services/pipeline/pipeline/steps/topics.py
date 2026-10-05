"""Step 8 — topic discovery on negative clauses.

Embeddings of negative clauses → PCA (noise reduction) → HDBSCAN clustering →
class-based TF-IDF keywords per cluster. Clusters where most clauses already have a
fixed aspect are labelled with that aspect; the rest are "Uncategorised themes".
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field

import numpy as np

log = logging.getLogger("pipeline.topics")

GENERIC_WORDS = {
    "app", "worst", "bad", "good", "service", "order", "ordered", "experience", "really", "just", "like", "time",
    "dont", "don", "didn", "doesn", "got", "get", "use", "using", "used", "pls", "please", "ok", "okay", "im",
    "disappointed", "fix", "asap", "pathetic", "useless", "horrible", "terrible", "uninstalling", "uninstall",
    "recommended", "waste", "worse", "better", "best", "never", "again", "unacceptable", "totally", "works",
    "special", "fine", "nothing", "average", "improve", "hope", "let", "see", "moving", "anymore", "fraud",
}


@dataclass
class TopicOut:
    id: str
    label: str
    keywords: list[str]
    size: int
    is_uncategorised: bool
    nearest_aspect_key: str | None
    example_review_ids: list[str]
    members: list[int] = field(default_factory=list)  # indices into the clause list


def c_tf_idf_keywords(docs_by_cluster: dict[int, list[str]], top_n: int = 6,
                     extra_stopwords: set[str] | None = None) -> dict[int, list[str]]:
    """Class-based TF-IDF (as in BERTopic). Each clause is vectorised on its own, so n-grams never
    span two clauses; counts are then summed per cluster."""
    from sklearn.feature_extraction.text import CountVectorizer

    labels = sorted(docs_by_cluster)
    stop = list(set(CountVectorizer(stop_words="english").get_stop_words()) | GENERIC_WORDS | (extra_stopwords or set()))
    vec = CountVectorizer(ngram_range=(1, 2), stop_words=stop, min_df=2, token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b")
    all_docs = [d for k in labels for d in docs_by_cluster[k]]
    try:
        M = vec.fit_transform(all_docs)
    except ValueError:  # empty vocabulary
        return {k: [] for k in labels}
    rows, i = [], 0
    for k in labels:
        n = len(docs_by_cluster[k])
        rows.append(np.asarray(M[i : i + n].sum(axis=0)).ravel())
        i += n
    X = np.vstack(rows).astype(float)
    tf = X / np.maximum(X.sum(axis=1, keepdims=True), 1)
    avg_words = X.sum() / len(labels)
    idf = np.log(1 + avg_words / np.maximum(X.sum(axis=0), 1))
    scores = tf * idf
    vocab = np.array(vec.get_feature_names_out())
    out = {}
    for row, k in enumerate(labels):
        idx = np.argsort(-scores[row])[: top_n * 3]
        words: list[str] = []
        for w in vocab[idx]:
            if scores[row][list(vocab).index(w)] <= 0:
                break
            if not any(w in other or other in w for other in words):  # skip near-duplicate n-grams
                words.append(str(w))
            if len(words) == top_n:
                break
        out[k] = words
    return out


def discover_topics(clause_texts: list[str], clause_review_ids: list[str], vectors: np.ndarray,
                    nearest_aspect, min_cluster_size: int = 12, merge_threshold: float = 0.5, max_topics: int = 15,
                    extra_stopwords: set[str] | None = None, categorised_similarity: float = 0.55) -> list[TopicOut]:
    """Cluster negative clauses that no fixed aspect category picked up.

    1. HDBSCAN finds dense micro-clusters (near-identical complaints).
    2. Agglomerative clustering (cosine, average linkage) merges micro-cluster centroids into themes.
    3. Class-based TF-IDF names each theme; generic themes ("worst app") are dropped.
    `nearest_aspect(centroid) -> (key, similarity)` reports the closest fixed category, so a theme that is
    really a missed paraphrase of a known aspect is flagged as such instead of "uncategorised".
    """
    n = len(clause_texts)
    if n < max(30, min_cluster_size * 2):
        log.info("Topic discovery skipped: only %d candidate clauses", n)
        return []
    from sklearn.cluster import HDBSCAN, AgglomerativeClustering

    micro = HDBSCAN(min_cluster_size=min_cluster_size, min_samples=3).fit_predict(vectors)
    ids = sorted(set(int(x) for x in micro) - {-1})
    if not ids:
        return []
    cents = np.stack([vectors[micro == k].mean(axis=0) for k in ids])
    cents /= np.linalg.norm(cents, axis=1, keepdims=True)
    if len(ids) > 1:
        merged = AgglomerativeClustering(n_clusters=None, distance_threshold=merge_threshold, metric="cosine",
                                         linkage="average").fit_predict(cents)
    else:
        merged = np.zeros(1, dtype=int)
    theme_of = {k: int(m) for k, m in zip(ids, merged)}
    clusters: dict[int, list[int]] = {}
    for i, lab in enumerate(micro):
        if lab >= 0:
            clusters.setdefault(theme_of[int(lab)], []).append(i)
    keywords = c_tf_idf_keywords({k: [clause_texts[i] for i in idx] for k, idx in clusters.items()},
                                 extra_stopwords=extra_stopwords)

    topics: list[TopicOut] = []
    for k, idx in sorted(clusters.items(), key=lambda kv: -len(kv[1])):
        if len(topics) >= max_topics:
            break
        kws = keywords.get(k, [])
        mean_words = sum(len(clause_texts[i].split()) for i in idx) / len(idx)
        if len(kws) < 2 or mean_words < 4:
            continue  # generic complaints ("worst app", "fix asap") are not a theme
        centroid = vectors[idx].mean(axis=0)
        centroid /= np.linalg.norm(centroid)
        near_key, near_sim = nearest_aspect(centroid)
        nearest = sorted(idx, key=lambda i: -float(vectors[i] @ centroid))
        topics.append(TopicOut(
            id=str(uuid.uuid4()),
            label=" / ".join(kws[:3]),
            keywords=kws,
            size=len(idx),
            is_uncategorised=near_sim < categorised_similarity,
            nearest_aspect_key=near_key,
            example_review_ids=list(dict.fromkeys(clause_review_ids[i] for i in nearest))[:5],
            members=idx,
        ))
    log.info("Topic discovery: %d themes from %d negative clauses without a fixed aspect (%d uncategorised)",
             len(topics), n, sum(t.is_uncategorised for t in topics))
    return topics

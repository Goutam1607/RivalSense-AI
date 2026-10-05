# 003 — NLP models

**Context.** Need aspect-based sentiment (ABSA), overall sentiment and sentence embeddings that run on a CPU laptop
(16 GB RAM) for ~6,000 reviews in under ~20 minutes, with clear licences.

| Purpose | Model | Size | Licence | Why |
|---|---|---|---|---|
| Aspect sentiment | `yangheng/deberta-v3-base-absa-v1.1` | ~740 MB | MIT | Widely used ABSA checkpoint (PyABSA); takes (sentence, aspect) pairs; separates aspects inside contrastive sentences. |
| Overall / clause sentiment | `cardiffnlp/twitter-roberta-base-sentiment-latest` | ~500 MB | CC-BY-4.0 | 2.6M downloads/month; trained on short informal text similar to app reviews; 3 classes incl. neutral. |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` | ~90 MB | Apache-2.0 | Fast, standard sentence embeddings for aspect similarity and topic clustering. |

All three were verified to load and run on CPU (ABSA ≈ 25–30 pairs/s, sentiment ≈ 25–70 texts/s with 6 threads).

**Alternatives considered.** Zero-shot NLI for aspects (slower, less precise); a multilingual sentiment model (would
hide that Hinglish is not really supported — deferred); an LLM per review (cost, latency, no reproducibility).

**Decision details.** ABSA receives the *sentence* containing the clause (tested: clause-only input lost sentiment in
“refund was processed | but I never got the money”). Embedding-only detections use the clause sentiment because the
aspect term may not appear in the text.

**Consequences.** Full demo run ≈ 7.4 min cold, ≈ 40 s warm (disk cache). Known weakness: implicit complaints
(“still waiting for my refund”) are often labelled neutral — visible in the evaluation.

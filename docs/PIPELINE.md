# NLP pipeline

`services/pipeline` — Python 3.11, CPU only. Analysis runs offline in batches; the web app only reads results.

## Commands (PowerShell, from `services/pipeline` with the virtual environment active)

| Command | What it does |
|---|---|
| `python -m pipeline generate-demo` | Writes the synthetic demo dataset (stdlib only, deterministic). |
| `python -m pipeline run --provider demo` | Ingests the demo dataset (idempotent) and analyses the demo market. |
| `python -m pipeline run --provider csv --csv FILE --market SLUG [--mapping JSON]` | Imports any CSV of reviews into a market and analyses it. |
| `python -m pipeline collect [--cap 2000] [--competitor zepto]` | Collects public Google Play reviews into “Quick Commerce (Live data)”. |
| `python -m pipeline run --provider google_play` | Collect + analyse in one go. |
| `python -m pipeline run --provider db --workspace W --market M` | Analyse reviews already stored for any market (CSV uploads from the web app, etc.). |
| `python -m pipeline sample-gold --n 200` | Draws a stratified, *unlabelled* sample of real reviews into `eval/gold.csv`. |
| `python -m pipeline label` | Terminal labelling helper for the gold set (resumable). |
| `python -m pipeline eval` | Model vs baseline on the gold set + synthetic sanity check → `docs/EVALUATION.md`. |
| `pytest` | Unit, contract and planted-signal tests. |

Useful flags for `run`: `--limit 400` (quick smoke run), `--skip-topics`, `--spot-check 15` (print random analysed reviews).

## Steps

| # | Step | Module | Notes |
|---|---|---|---|
| 1 | Ingest | `providers/*` | `DataProvider` protocol → `RawReview` (text, rating, date, app version). Upsert on `(data_source, external_key)`. |
| 2 | Clean | `steps/clean.py` | Strip HTML/control chars, normalise whitespace and repeated punctuation, keep emoji. Dedupe by SHA-256 of normalised text + source + date (texts ≥ 20 chars). Spam rules: links, phone numbers, referral/loan phrases, repeated words. |
| 3 | Language | `steps/language.py` | Script detection (Devanagari & other Indic), a romanised-Hindi lexicon for Hinglish, Lingua for other Latin-script languages. Only `en` continues; others are stored as `NOT_ANALYSED_LANGUAGE`. |
| 4 | Clauses | `steps/clauses.py` | Split at sentence ends and contrast markers (but, however, though, although, whereas, except, yet, `;`) with character offsets. |
| 5 | Aspects | `steps/aspects.py` | (a) seed-keyword lexicon with word boundaries → LEXICON; (b) MiniLM embedding similarity to short prototype phrases from each category description (threshold 0.65, margin 0.04) → EMBEDDING; both → BOTH. |
| 6 | Aspect sentiment | `steps/models.py` | `yangheng/deberta-v3-base-absa-v1.1` on (sentence containing the clause, aspect term). Embedding-only detections use the clause's sentiment. |
| 7 | Overall sentiment | `steps/models.py` | `cardiffnlp/twitter-roberta-base-sentiment-latest` on the review and on each clause. |
| 8 | Topics | `steps/topics.py` | Negative clauses with no fixed aspect → HDBSCAN micro-clusters → agglomerative merge (cosine 0.5) → class-based TF-IDF labels; nearest category recorded. |
| 9 | Aggregation | `steps/aggregate.py` | Competitor × aspect × week/month: counts, score, Wilson bounds, confidence, share of voice. |
| 10 | Trends | `steps/trends.py` | Emerging issues (two-proportion z-test) and app-version drops (Benjamini–Hochberg). |
| 11 | Insights | `steps/insights.py`, `llm/` | Typed template insights with evidence; optional LLM rewording with a number validator. |

All model calls are batched, length-sorted, cached on disk (`.cache/inference.sqlite`, keyed by model revision +
input) and show progress bars. Models download once into `.cache/hf`; after that `HF_HUB_OFFLINE=1` works.

## Performance (Ryzen 5, 16 GB, no GPU)

| Run | Reviews | Time |
|---|---|---|
| Demo market, cold cache | 6,450 | 7.4 min (overall + clause sentiment 4.4 min, ABSA 2.4 min) |
| Demo market, warm cache | 6,458 | ≈ 40 s |
| Live market (1,200 real reviews), cold | 1,200 | 1.6 min |

## Adding a data provider
1. Create `pipeline/providers/<name>.py` with a class that has `name`, `market_slug`, `market_name`, `market_kind`,
   `competitors() → list[CompetitorSpec]` and `iter_reviews(competitor=None) → Iterator[RawReview]`.
2. Store only text, rating, date, app version; hash platform review IDs into `external_key`.
3. Register it in `run.py → _provider()` and in the `--provider` choices in `cli.py`.
4. Add a unit test with a small fixture (see `tests/test_llm_and_providers.py::test_csv_provider_with_mapping`).

## CSV mapping
```powershell
python -m pipeline run --provider csv --csv reviews.csv --market my-market `
  --mapping '{"competitor": "app_name", "text": "content", "rating": "score", "date": "at", "app_version": "version"}'
```
Keys: `competitor`, `text`, `rating`, `date` (required), `app_version`, `id` (optional, hashed). Other columns are ignored.

## Responsible collection
Google Play collection uses `google-play-scraper` with a default cap of 2,000 reviews per app, a 2-second delay
between pages and exponential-backoff retries; no proxies, CAPTCHA solving or evasion. Usernames, avatars, user IDs and
developer replies are discarded when read. **You are responsible for checking the source's terms of service before
collecting.**

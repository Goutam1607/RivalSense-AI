# Data model

The schema lives in `prisma/schema.prisma` (Prisma owns migrations). Tables use snake_case names so the Python
pipeline can use plain SQL; `services/pipeline/pipeline/db.py → CONTRACT` lists every column the pipeline touches,
and `tests/test_db_and_signals.py` fails if one is missing.

## Tables

| Table | One line |
|---|---|
| `user`, `session`, `account`, `verification`, `rate_limit` | Better Auth: users, database sessions, credentials (scrypt hash) / OAuth links, tokens, rate-limit counters. |
| `workspace` | A tenant. `is_demo = true` marks the shared, read-only demo workspace. |
| `membership` | User ↔ workspace with a role (`OWNER`, `MEMBER`). |
| `market` | A set of competitors analysed together; `data_kind` = `DEMO_SYNTHETIC` or `LIVE`. |
| `aspect_category` | Per-market aspect taxonomy (key, label, description for embeddings, seed keywords). |
| `competitor` | A tracked company in a market (`ACTIVE`/`ARCHIVED`, stable chart colour slot). |
| `data_source` | Where a competitor's reviews come from (`DEMO`, `CSV`, `GOOGLE_PLAY` + package id). |
| `review` | Raw review: text, rating, date, app version, language, status (`ANALYSED`, `NOT_ANALYSED_LANGUAGE`, `DUPLICATE`, `SPAM`, `PENDING`), content hash, collected_at. No reviewer identity. |
| `analysis_run` | One pipeline execution: status, timings and counts, model names/revisions, parameters, evaluation summary. |
| `review_sentiment` | Overall sentiment of an analysed review (label, confidence, class probabilities). |
| `review_clause` | Clauses with character offsets and clause sentiment (for the explorer's clause view). |
| `aspect_mention` | One (review, aspect) pair with sentiment, confidence, detection layer and matched-text offsets. |
| `aspect_aggregate` | Competitor × aspect × period (week, month): counts, score, Wilson bounds, confidence, share of voice. |
| `emerging_issue` | Trend finding (`TIME_WINDOW` or `APP_VERSION`) with both windows' counts, z statistic and p-value. |
| `topic`, `topic_assignment` | Discovered complaint themes (keywords, size, nearest category) and their clauses. |
| `insight`, `insight_evidence` | Typed insight (OBSERVATION / INTERPRETATION / OPPORTUNITY / RECOMMENDATION) with facts, confidence, impact and links to supporting reviews. |
| `report` | Saved report: config, status and a frozen JSON snapshot of all numbers. |
| `share_link` | Random token for read-only public access to a report; revocable, optional expiry, access count. |

## Relations (simplified)

```
workspace 1─* membership *─1 user
workspace 1─* market 1─* competitor 1─* data_source 1─* review
market 1─* aspect_category
market 1─* analysis_run 1─* {review_sentiment, review_clause, aspect_mention, aspect_aggregate, emerging_issue, topic, insight}
review 1─1 review_sentiment ; review 1─* review_clause 1─* aspect_mention
insight *─* review (insight_evidence) ; insight 1─* insight (parent → interpretation/recommendation)
workspace 1─* report 1─* share_link
```

## Indexes for the hot queries

| Query | Index |
|---|---|
| Review explorer, newest first with cursor `(reviewed_at, id)` | `review (market_id, reviewed_at DESC, id)` |
| Explorer filters | `review (competitor_id, reviewed_at)`, `(market_id, rating)`, `(market_id, language)`, `(market_id, status)` |
| Keyword search | GIN `to_tsvector('english', text)` (hand-written migration `review_fulltext_search`) |
| Dashboard aspect matrix for a date window | `aspect_mention (market_id, reviewed_at)`, `(competitor_id, aspect_category_id, reviewed_at)` |
| Sentiment over time | `review_sentiment (market_id, reviewed_at)`, `(competitor_id, reviewed_at)` |
| Trends from aggregates | `aspect_aggregate (market_id, grain, period_start)` |
| Insights feed | `insight (market_id, type)`, `insight (competitor_id)`, `insight_evidence (review_id)` |
| Report list | `report (workspace_id, created_at DESC)` |

Denormalised `market_id`, `competitor_id` and `reviewed_at` on analysis tables keep dashboard queries to a single
indexed scan without joins back to `review`.

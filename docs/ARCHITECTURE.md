# Architecture

RivalSense is a monorepo with two halves that share one PostgreSQL database. The **Python pipeline** does all
analysis offline and writes results; the **Next.js web app** only reads precomputed results (plus user-owned
configuration such as competitors, reports and share links).

```
                       ┌─────────────────────────── services/pipeline (Python 3.11, CPU) ────────────────────────────┐
  Data providers       │                                                                                              │
  ───────────────      │  1 ingest → 2 clean/dedupe/spam → 3 language → 4 clauses → 5 aspects (lexicon + embeddings)  │
  demo (synthetic) ───▶│  → 6 aspect sentiment (ABSA) → 7 overall sentiment → 8 topics (HDBSCAN + c-TF-IDF)            │
  csv (any dataset)    │  → 9 aggregates (score, Wilson, SoV) → 10 trends (z-test, BH) → 11 insights (templates [+LLM]) │
  google_play (live)   │                                                                                              │
                       └───────────────┬──────────────────────────────────────────────────────────────────────────────┘
                                       │ psycopg + COPY, every row tagged with analysis_run_id
                                       ▼
                       ┌─────────────────────────── PostgreSQL (schema owned by Prisma) ─────────────────────────────┐
                       │  review · review_clause · aspect_mention · review_sentiment · aspect_aggregate              │
                       │  emerging_issue · topic · insight(+evidence) · analysis_run · report · share_link · auth    │
                       └───────────────┬──────────────────────────────────────────────────────────────────────────────┘
                                       │ Prisma client / parameterised SQL, always scoped to the user's workspace
                                       ▼
                       ┌─────────────────────────── apps/web (Next.js 16, App Router) ───────────────────────────────┐
                       │  server/        data-access layer (context → workspace → market), auth, actions, reports    │
                       │  app/(app)      dashboard · competitors · reviews · insights · compare · trends · reports    │
                       │  app/api/v1     REST JSON + CSV/PDF exports   ·   app/(marketing) landing   ·   /share/[t]    │
                       │  components/ features/  UI (server components by default; charts are client components)     │
                       └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Who owns what

| Part | Owns | Never does |
|---|---|---|
| `prisma/schema.prisma` | The database schema and migrations (single source of truth) | — |
| `services/pipeline` | Collection, NLP, metrics, trends, insight text; writes analysis tables | Serve users |
| `apps/web/server` | Authentication, workspace scoping, every database read/write from the web | Call an LLM to produce numbers |
| `apps/web/app`, `components`, `features` | Rendering, URL state, forms | Query the database directly |
| `config/markets/*.json` | Default aspect taxonomy, demo + live competitor lists | — |

## Key decisions

1. **Batch analysis, not per request.** Models (≈ 800 MB) stay out of serverless functions, pages load in milliseconds,
   and every number is reproducible from an `analysis_run` (models, parameters and counts are stored on it).
2. **One data-access layer.** Every server function receives an `AppContext` built from the session; the active
   workspace/market come from cookies but are re-validated against memberships, and raw SQL re-checks
   `market.workspace_id`. Route handlers and pages never import Prisma directly.
3. **Re-runs replace results.** A run deletes the market's previous analysis rows and inserts new ones in one
   transaction; reports keep a frozen snapshot so they never change afterwards.
4. **LLM optional.** Insight text is deterministic; an LLM may only reword it, and output containing a number not in
   the computed facts is rejected (`pipeline/llm`).
5. **Demo data is synthetic and labelled.** Fictional companies, a persistent banner, and a label on every export.

See `docs/decisions/` for the ADRs, `docs/DATA_MODEL.md` for tables, `docs/METRICS.md` for formulas,
`docs/PIPELINE.md` for the NLP steps and `docs/API.md` for HTTP endpoints.

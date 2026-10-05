# RivalSense

**Know what your competitors' customers really think.** RivalSense turns public customer reviews of competing apps into
evidence-backed competitive intelligence: what customers praise, what they complain about, which problems are growing,
where competitors differ, and where an opportunity exists. Every number on screen comes from SQL over the output of a
real NLP pipeline, and every insight links to the reviews behind it.

First market: Indian quick commerce. The demo uses **synthetic reviews of four fictional apps** (Dashly, Kwikr,
Basketo, MinuteMart); the live market uses real public Google Play reviews of Zepto, Blinkit, Swiggy Instamart and BigBasket.

| | |
|---|---|
| **NLP pipeline (Python)** | cleaning, dedupe, spam rules · language detection incl. Hinglish · clause splitting · aspect detection (lexicon + sentence embeddings) · aspect-based sentiment (DeBERTa ABSA) · overall sentiment (RoBERTa) · topic discovery (HDBSCAN + c-TF-IDF) · Wilson intervals · two-proportion z-tests · Benjamini–Hochberg · template insights with optional, validated LLM rewording |
| **Data collection** | Google Play provider (polite cap, delays, backoff, no reviewer identities) · CSV import with column mapping · deterministic synthetic generator with planted signals |
| **Web app (TypeScript)** | Next.js 16 App Router · Prisma 7 + PostgreSQL · Better Auth · Tailwind 4 · Recharts · workspace-isolated data-access layer · REST API · PDF reports (@react-pdf) · share links |
| **Quality** | 40 pytest + 24 Vitest + 12 Playwright tests (incl. axe accessibility checks and cross-workspace authorization) · evaluation against a lexicon + VADER baseline |

## Screens
Overview dashboard · competitor profiles (customer voice, strengths, weaknesses, trends, competitive position) ·
review explorer (URL filters, full-text search, highlighted aspects, clause analysis, CSV export) · insights feed +
evidence-based SWOT · compare & gap matrix · trends with emerging issues and discovered themes · reports (PDF, CSV,
share links) · settings (AI provider, aspect taxonomy, analysis runs).

## Architecture
```
providers (demo · csv · google_play) ─▶ Python pipeline (11 steps, CPU) ─▶ PostgreSQL ◀─ Next.js data-access layer ─▶ UI / REST / PDF
```
Analysis runs offline in batches (ADR 001); the web app only reads precomputed results. Details:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/PIPELINE.md](docs/PIPELINE.md) · [docs/METRICS.md](docs/METRICS.md) ·
[docs/DATA_MODEL.md](docs/DATA_MODEL.md) · [docs/API.md](docs/API.md) · [docs/decisions/](docs/decisions/)

## Evaluation (honest)
| Measured on | Aspect detection F1 | Aspect sentiment accuracy | Overall sentiment macro-F1 |
|---|---:|---:|---:|
| Synthetic demo labels (n = 1,500, optimistic) — model | 0.88 | 0.86 | 0.70 |
| Same, baseline (lexicon + VADER) | 0.88 | 0.49 | 0.49 |
| Hand-labelled real reviews (gold set) | pending — see [docs/EVALUATION.md](docs/EVALUATION.md) | | |

The transformer models clearly beat VADER on sentiment. Aspect *detection* does not beat the baseline on synthetic
data because both share the same lexicon there — the gold set of real reviews is the real test.

## Getting started (Windows, PowerShell)

Prerequisites: **Node 24 LTS** (e.g. `fnm install 24; fnm use 24`), **Python 3.11+**, Git. Docker Desktop is optional.

```powershell
git clone <repo-url> rivalsense; cd rivalsense
Copy-Item .env.example .env            # then set BETTER_AUTH_SECRET to a long random string
npm install                            # installs web deps and generates the Prisma client
npm run db:up                          # starts PostgreSQL (Docker if running, otherwise embedded in .data/postgres)
npm run db:migrate                     # applies migrations
npm run seed                           # demo workspace + demo user + 6,458 synthetic reviews

# NLP pipeline (one-time setup, ~2 GB download)
cd services/pipeline
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements.txt
python -m pipeline run --provider demo  # ~8 min first run (models download once), ~1 min afterwards
cd ../..

npm run dev                             # http://localhost:3000 → "Explore demo"
```
Demo login (also used by the button): `demo@rivalsense.dev` / `demo-password-123`.

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Web app |
| `npm run lint` / `typecheck` / `test` / `test:e2e` | ESLint, TypeScript, Vitest, Playwright (`npx playwright install chromium` once) |
| `npm run db:up` / `db:down` / `db:status` | Local PostgreSQL |
| `npm run db:migrate` / `db:deploy` / `db:reset` | Prisma migrations (`db:reset` wipes the database) |
| `npm run seed` | Load or re-sync the demo market (idempotent) |
| `python -m pipeline run --provider demo\|csv\|google_play\|db` | Analysis pipeline (from `services/pipeline`) |
| `python -m pipeline collect --cap 300` | Collect real Google Play reviews (live market) |
| `python -m pipeline sample-gold` → `label` → `eval` | Build and score the hand-labelled gold set |
| `pytest` | Pipeline tests (from `services/pipeline`) |

**Data collection notice:** the Google Play provider collects only public reviews, with a small volume cap and delays.
You are responsible for checking the source's terms of service before collecting.

## Adding a data provider
Implement the `DataProvider` protocol in `services/pipeline/pipeline/providers/` (competitors + `iter_reviews()`
returning text, rating, date and app version only), register it in `run.py`, add a test. See [docs/PIPELINE.md](docs/PIPELINE.md).

## Deployment
Vercel (web) + Neon (Postgres); the pipeline runs from a laptop or a manual GitHub Actions workflow. Step-by-step:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Limitations and future work
* Only English reviews are analysed; Hinglish/Hindi are counted and shown as “not yet analysed”. Next: a multilingual
  or Hinglish-tuned model behind the same step.
* App-store reviewers are not a representative sample of all customers.
* The ABSA model reads implicit complaints (“still waiting for my refund”) as neutral too often.
* The live market is small (1,200 reviews) by design; more sources (App Store, social, support tickets) would help.
* The gold set (200 real reviews) still needs hand labels to publish real accuracy numbers.

## Project status
See [PROGRESS.md](PROGRESS.md). Interview preparation: [docs/INTERVIEW_NOTES.md](docs/INTERVIEW_NOTES.md).

# CLAUDE.md — RivalSense

This file is read at the start of every Claude Code session. It holds the standing rules for the project. Stage-by-stage work instructions arrive as separate prompts. If a prompt and this file conflict, ask before acting.

---

## 1. What we are building

**RivalSense** — a competitive-intelligence web app that turns public customer reviews of competing apps into evidence-backed findings: what customers praise, what they complain about, which problems are growing, where competitors differ, and where an opportunity exists.

The first market is **Indian quick commerce** (Zepto, Blinkit, Swiggy Instamart, BigBasket). The data model must support any market.

The goal is a portfolio project that looks and behaves like a real B2B analytics product **and** contains a genuine, measurable NLP pipeline. The NLP is the core of the project, not decoration.

Resume claims this project must honestly back up: **Python, web scraping / data collection, NLP, Generative AI, data visualization, REST APIs.** Every one of these must exist as real, working code.

---

## 2. Who you are working with

- The developer (Goutam) is a final-year ECE/AIML student. He is a **beginner** at git, Linux tooling, and full-stack web development, and comfortable with Python and ML basics.
- Machine: **Windows laptop** (Ryzen 5, 16 GB RAM, no GPU), Docker Desktop installed. Use **PowerShell** syntax when giving him commands. All npm scripts must be cross-platform (no bash-only scripts; use Node or Python scripts instead of `rm -rf`, `export`, etc.).
- After each stage, write a short plain-English summary of what was built, what each new command does, and how to check it works.
- He will be interviewed about this project. Maintain `docs/INTERVIEW_NOTES.md` (see §9).

---

## 3. Architecture (fixed unless a prompt says otherwise)

Monorepo with two halves that share one PostgreSQL database:

```
rivalsense/
├─ apps/web/            Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
│  ├─ app/              routes: (marketing), (auth), (app)/dashboard, ...
│  ├─ components/       shared UI only (no data fetching)
│  ├─ features/         feature modules: competitors, reviews, insights, compare, trends, reports
│  ├─ server/           data-access layer, auth, services — server-only code
│  ├─ lib/              utilities, formatting, constants
│  └─ tests/            vitest unit tests + playwright e2e
├─ services/pipeline/   Python 3.11+ NLP batch pipeline
│  ├─ providers/        data providers (demo, csv, google_play)
│  ├─ steps/            clean, detect_language, sentiment, aspects, topics, trends, insights
│  ├─ eval/             gold-labelled set + evaluation script
│  └─ tests/            pytest
├─ prisma/              schema.prisma + migrations (the single source of truth for the DB schema)
├─ docs/                ARCHITECTURE.md, METRICS.md, API.md, INTERVIEW_NOTES.md, decisions/ (ADRs)
├─ docker-compose.yml   local PostgreSQL
├─ PROGRESS.md          stage tracker (see §8)
└─ README.md
```

Key decisions and why:

1. **Analysis runs as an offline Python batch pipeline, not inside web requests.** The pipeline reads raw reviews, runs NLP, and writes results (sentiments, aspect mentions, aggregates, trends, insights) to Postgres tagged with an `analysis_run_id` and `model_version`. The web app only reads precomputed results. This keeps pages fast, keeps ML models out of serverless functions, and makes every number reproducible.
2. **Prisma owns the schema and migrations.** Python accesses the same tables with `psycopg` and parameterised SQL. A pytest contract test checks that every table/column the pipeline uses exists.
3. **The web app never calls an LLM to produce numbers.** All numbers come from SQL over pipeline output.
4. **LLM use is optional and behind an interface** (`LLMProvider` with Anthropic, OpenAI, and "none" implementations). With no API key, the app must still work fully, using template-based insight text.
5. Use the **current stable versions** of every library. Check what is installed (`node -v`, `python --version`) and check docs rather than relying on memory for APIs that change between major versions (Next.js, Auth, Prisma, Tailwind). Pin versions in `package.json` / `requirements.txt`.

Record any significant decision you make that is not listed here as a short ADR in `docs/decisions/NNN-title.md` (context, options considered, decision, consequences).

---

## 4. Non-negotiable rules

### Data integrity
- **Never invent data.** No hard-coded numbers in UI components. Every number on screen comes from the database, and every insight links to the reviews that support it.
- Every metric shows its **evidence**: number of reviews it is based on, source(s), date range, and last analysis run time.
- If a metric has fewer than the minimum sample size (see §5), show "Not enough data (n = X)" instead of a number.
- Demo data is **synthetic**. It must be labelled "Demo dataset — synthetic reviews" on every screen that shows it (a persistent banner in the app shell is enough, plus a label on exported reports).
- **Synthetic demo data uses fictional company names** (e.g. "Dashly", "Kwikr", "Basketo", "MinuteMart"), never real brands, so the app never displays invented complaints about real companies. Real brand names appear only with real imported data.

### Observation vs. interpretation
Every insight is typed as exactly one of: `OBSERVATION` (a computed fact from the data), `INTERPRETATION` (a likely explanation), `OPPORTUNITY`, `RECOMMENDATION`. Only `OBSERVATION` may state numbers as facts. The UI shows the type label on every insight. Interpretations and recommendations carry the text "Analytical suggestion — not verified market fact".

### No fake functionality
Every visible button either works, opens a meaningful UI, or is visibly disabled with a tooltip explaining why ("Requires an API key — see Settings"). No dead links. No pretend "AI is thinking" animations over hard-coded output.

### Data collection ethics
- Providers must respect terms of service, rate limits, and robots.txt. No CAPTCHA bypassing, proxy rotation, or evasion of platform protections.
- Store only what analysis needs: review text, rating, date, app version, source, language. **Do not store reviewer names, profile images, or user IDs.**
- Every stored review records its source and the time it was collected.

### Security
- Every database query for app data is scoped to the current user's workspace through one data-access layer in `apps/web/server/`. Route handlers never call Prisma directly.
- Validate every input with zod. Return typed errors; never show stack traces to users.
- Secrets live only in environment variables, read only on the server. `.env.example` lists every variable with a comment.
- Rate-limit auth endpoints and any endpoint that triggers expensive work.

---

## 5. Metric definitions (implement exactly; document in `docs/METRICS.md`)

These definitions make the numbers defensible. Do not change them silently; if one seems wrong, propose a change.

- **Aspect mention**: one (review, aspect) pair with a sentiment label ∈ {positive, neutral, negative} and a model confidence. One review can mention several aspects with different sentiments.
- **Aspect categories (initial)**: delivery_speed, pricing, discounts_offers, product_availability, product_quality, order_accuracy, customer_support, refunds_returns, app_experience, payments. Stored in a table, not hard-coded, so markets can define their own.
- **Aspect score (0–100)** for a competitor, aspect, and period:
  `score = 50 × (1 + (pos − neg) / (pos + neu + neg))`
  → 100 = all positive, 50 = balanced, 0 = all negative.
- **Minimum sample size**: show a score only if mentions ≥ 30. Otherwise "Not enough data".
- **Uncertainty**: alongside each score, show a 95% Wilson interval for the positive share and the negative share. Label confidence High / Medium / Low from the interval width (< 10 pts / 10–20 pts / > 20 pts).
- **Share of voice for an aspect**: mentions of that aspect ÷ total reviews for that competitor in the period.
- **Emerging issue**: an aspect whose negative-mention share in the most recent window (default 30 days) is higher than in the previous window of equal length, with
  (a) at least 20 negative mentions in the recent window,
  (b) a relative increase ≥ 25%, and
  (c) a two-proportion z-test p < 0.05.
  Store the test statistic and p-value with the finding.
- **Competitive gap**: for an aspect, the difference between a competitor's score and the median score of the other competitors. Flag as a gap when |difference| ≥ 10 points **and** the confidence intervals do not overlap.
- **Market-wide weakness**: an aspect where every competitor with enough data scores below 55.
- **Strength / weakness ranking** for a competitor: rank aspects by score, break ties by mention volume. Only aspects with enough data are ranked.

---

## 6. NLP pipeline requirements

Pipeline stages, each a separate module with a typed input/output and its own tests:

1. **Ingest** — provider returns raw reviews in a common schema.
2. **Clean** — strip HTML/control chars, normalise whitespace and repeated punctuation, keep emojis (they carry sentiment), deduplicate by a hash of normalised text + source + date.
3. **Language detection** — label every review. English reviews go through the full pipeline. Non-English and Hinglish (romanised Hindi) reviews are stored, counted, and shown as "not yet analysed (language: X)". Do not fake multilingual analysis; design the step so a multilingual model can be added later.
4. **Clause splitting** — split reviews on contrast markers ("but", "however", "though", "although", ";") so "Delivery was fast but the refund took three days" yields two clauses.
5. **Aspect detection** — two layers: (a) a seed-keyword lexicon per category for high precision, (b) sentence-embedding similarity to category descriptions for recall. Record which layer fired.
6. **Aspect sentiment** — a pre-trained aspect-based sentiment model from Hugging Face (find a well-used ABSA model; verify it loads and record its name and licence in an ADR). Fall back to a general sentiment model applied per clause if needed.
7. **Overall review sentiment** — a pre-trained transformer sentiment model.
8. **Topic discovery** — cluster embeddings of negative clauses (e.g. BERTopic or HDBSCAN) to surface complaint themes that do not fit the fixed categories. Show these as "Uncategorised themes" with example reviews.
9. **Aggregation** — compute the metrics in §5 per competitor × aspect × period with SQL or pandas; write to aggregate tables.
10. **Trend + emerging-issue detection** — per §5.
11. **Insight generation** — deterministic templates build insights from aggregates (with evidence review IDs). If an LLM key is configured, the LLM may rewrite the wording, but receives only the computed facts and must not add numbers; validate its output contains no numbers absent from the input.

Constraints:
- Must run on CPU with 16 GB RAM. Batch inputs, cache embeddings to disk, show a progress bar. Target: 5,000 reviews in under ~20 minutes.
- `python -m pipeline run --provider demo` must work offline after models are downloaded once.
- **Evaluation is required.** `services/pipeline/eval/gold.csv` holds 150–200 hand-labelled reviews (aspect + sentiment). `python -m pipeline eval` prints per-aspect precision, recall, F1, sentiment macro-F1, and compares against a simple baseline (keyword lexicon + VADER). Results are written to `docs/EVALUATION.md`. If real reviews are available, the gold set must use real reviews, not synthetic ones (evaluating on our own templates would be circular).

---

## 7. Design system

Feel: a serious enterprise analytics tool (think the restraint of Linear, Stripe Dashboard, Vercel). Information-dense, calm, fast.

- **Avoid**: gradients, glow, glassmorphism, blobs, neon, heavy shadows, giant rounded cards, oversized headings, decorative illustrations, robot/brain imagery, "Powered by AI" badges, emoji in UI, pill shapes everywhere, lorem ipsum, hype copy ("10x", "unlock", "revolutionary").
- **Colour**: neutral greys for 90% of the UI. Semantic colours only for meaning: green = positive, red = negative, amber = warning/emerging, blue = informational/links. One restrained accent colour. Never use colour alone to carry meaning (pair with text or icon) — colour-blind safe.
- **Typography**: one sans-serif (e.g. Inter or Geist) plus a monospace for numbers in tables. Tabular numerals in all tables. Small, clear type scale defined once in Tailwind config.
- **Layout**: 4/8 px spacing scale, 1 px subtle borders, small radii (4–8 px). Use cards only to group related content. Tables are first-class: sticky headers, sortable columns, row hover, right-aligned numbers.
- **Charts** (Recharts or similar): muted palette, labelled axes, tooltips with exact values and n, no 3D, no pie charts with more than 4 slices, no radar charts.
- **States**: every data view has a loading skeleton shaped like its content, a useful empty state with a next action, and an error state with "Try again".
- **Dark mode**: support it with CSS variables.
- **Accessibility**: semantic HTML, full keyboard navigation, visible focus rings, ARIA only where semantics fall short, WCAG AA contrast, charts have a table/summary alternative.
- **Responsive**: desktop first. On mobile the sidebar becomes a drawer, wide tables become stacked rows or horizontal-scroll with a frozen first column, charts simplify.
- **Copy**: plain, specific, product-like. Example: "Track how customer sentiment changes across competitors and see which categories drive dissatisfaction."

---

## 8. How to work

1. **One stage per session.** Each stage prompt has a goal, a scope, and "done when" checks.
2. **Plan first.** Read the relevant code and this file, then present a short plan (files to create/change, risks). Wait for approval before large changes.
3. **Build in small steps** and run the app/tests as you go. Do not write large amounts of code without running it.
4. **Verify before declaring done.** Run every "done when" check, plus `npm run lint`, `npm run typecheck`, `npm run test`, and `pytest` where relevant. For UI work, start the dev server and inspect the pages (screenshots via a browser tool if available). Fix what you find instead of only listing it.
5. **Commit** at the end of each stage with a clear message (e.g. `feat(reviews): review explorer with filters and pagination`). Explain to Goutam what the commit contains.
6. **Update `PROGRESS.md`** at the end of every stage: stage status, what was done, known issues, next step. This file is how work resumes after a break — keep it accurate.
7. Do not rewrite working code from earlier stages unless needed; if you must, say why.
8. If something cannot be built properly, build a clean interface, mark it clearly in the UI as unavailable, and record the limitation in `PROGRESS.md` — do not fake it.

---

## 9. Interview notes (maintain throughout)

At the end of each stage, append to `docs/INTERVIEW_NOTES.md`:
- 2–3 sentence beginner-friendly explanation of what was built and why.
- 4–6 likely interview questions about that stage with precise, short, beginner-friendly answers (e.g. "Why is analysis a batch job instead of running on each request?", "What is a Wilson interval and why use it instead of a plain percentage?", "How do you stop one workspace from reading another's data?").
- Any number he should remember (dataset size, eval F1, pipeline runtime).

---

## 10. Commands (must all work on Windows)

Web (run from repo root):
- `npm install` · `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run test` · `npm run test:e2e`
- `npm run db:up` (start Postgres in Docker) · `npm run db:migrate` · `npm run seed` · `npm run db:reset`

Pipeline (from `services/pipeline`, inside its virtual environment):
- `python -m pipeline run --provider demo|csv|google_play [--competitor X]`
- `python -m pipeline eval`
- `pytest`

---

## 11. Out of scope (do not build unless asked)

Real payments/billing (the pricing page is static marketing), email sending, real-time streaming, mobile apps, scraping sources that forbid it, multilingual model training.

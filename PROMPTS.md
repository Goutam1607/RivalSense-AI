# RivalSense — Stage prompts for Claude Code

How to use: put `CLAUDE.md` in the root of an empty project folder. Open Claude Code in that folder. Paste **one prompt per session**, starting with Prompt 0. When a stage is finished and committed, run `/clear` and paste the next prompt. If you stop halfway and come back later, use the **Resume prompt** at the bottom.

---

## Prompt 0 — Plan only (no code yet)

```
Read CLAUDE.md carefully. Then:

1. Check my environment and report versions: node, npm, python, git, docker. Tell me if anything needs installing or upgrading for the current stable Next.js and Prisma, with exact PowerShell commands.
2. Write docs/ARCHITECTURE.md: a one-page overview with a simple ASCII diagram showing provider → pipeline → Postgres → Next.js data-access layer → UI, and which part owns what.
3. Write the full Prisma data model as a draft in docs/DATA_MODEL.md (not yet in code). It must cover at least: User, Workspace, Membership (user↔workspace with role), Market, Competitor, DataSource, Review, AspectCategory, AspectMention, ReviewSentiment, AnalysisRun, AspectAggregate (competitor × aspect × period), Trend/EmergingIssue, Insight (with type OBSERVATION/INTERPRETATION/OPPORTUNITY/RECOMMENDATION and evidence links to reviews), Topic (discovered themes), Report, ShareLink. Explain each table in one line, show relations and the indexes needed for the review explorer and dashboard queries.
4. Create PROGRESS.md with all stages from PROMPTS.md listed as "not started".
5. List the top 5 risks you see in this plan (e.g. model size on CPU, Windows tooling) and how we will handle each.

Do not write application code in this session. Ask me anything you need to decide.
```

---

## Stage 1 — Foundation

```
Stage 1: project foundation. Follow CLAUDE.md.

Build:
- Monorepo layout from CLAUDE.md §3. git init with a sensible .gitignore (node_modules, .env, .venv, model caches, .next).
- apps/web: Next.js (App Router, TypeScript strict), Tailwind, shadcn/ui, ESLint, Prettier, Vitest, Playwright installed and configured.
- docker-compose.yml with PostgreSQL + a named volume. npm scripts db:up, db:migrate, db:reset that work in PowerShell.
- prisma/schema.prisma from docs/DATA_MODEL.md, first migration applied.
- Design tokens: Tailwind theme (colours as CSS variables with light/dark, type scale, spacing, radii) per CLAUDE.md §7. A /dev/design-system page (only in development) that shows typography, colours, buttons, inputs, table, badge for each insight type, sentiment badges, empty/loading/error state components.
- .env.example with comments. A typed env loader (zod) that fails fast with a clear message if a variable is missing.
- README.md "Getting started" section with exact PowerShell steps from a fresh clone.

Done when:
- From a fresh clone, following only README, I can run db:up, db:migrate, dev, and open the design-system page.
- npm run lint, typecheck, test, build all pass.
- I have reviewed the design-system page and it matches CLAUDE.md §7 (no gradients, restrained colours, clean table).
Then commit, update PROGRESS.md and docs/INTERVIEW_NOTES.md.
```

---

## Stage 2 — Synthetic demo dataset + seed

```
Stage 2: demo dataset and seed script.

Build a Python generator in services/pipeline/providers/demo/ that produces a realistic synthetic dataset, plus `npm run seed` that loads it (calling the generator or reading its output file).

Dataset requirements:
- Market "Quick Commerce (Demo)" with 4 FICTIONAL competitors (CLAUDE.md §4 — no real brand names).
- ~6,000 reviews across 12 months, 1–5 star ratings, realistic length variety (3 words to a long paragraph), typos, emojis, some multi-aspect reviews with mixed sentiment ("fast delivery but refund took 3 days"), ~8% Hinglish/Hindi reviews, some duplicates/spam to test cleaning.
- Build from many varied templates + slot filling + random noise so text does not look repetitive. Keep a hidden ground-truth label file (aspects + sentiment per review) for testing — never shown in the UI.
- PLANT known signals so later stages can prove they work, and document them in docs/DEMO_DATA.md:
  1. one competitor's refunds_returns complaints rise steadily over the last 3 months (should be detected as an emerging issue);
  2. one competitor is clearly best at product_availability (should appear as a competitive gap);
  3. customer_support is weak for everyone (should appear as a market-wide weakness);
  4. one competitor's app_experience drops sharply after a specific app version.
- Seed also creates: a demo workspace, a demo user (credentials in .env.example comment), data source records labelled "Demo dataset — synthetic".
- Seeding is idempotent (running twice does not duplicate data). Seeding 6,000 reviews takes under a minute (batch inserts).

Done when: npm run seed works on a fresh DB; a quick SQL summary (print it) shows counts per competitor, month, rating, and language; planted signals are visible in raw counts; tests cover the generator's determinism (same seed → same data).
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 3 — NLP pipeline core

```
Stage 3: Python NLP pipeline, steps 1–7 of CLAUDE.md §6.

Build:
- services/pipeline as a Python package with a virtual environment, requirements.txt (pinned), and a CLI: `python -m pipeline run --provider demo|csv`.
- DataProvider interface (Python Protocol/ABC) returning reviews in one common schema. Implement DemoProvider (reads Stage 2 data) and CsvProvider (any CSV with a documented column mapping — this is how real public datasets get imported).
- Steps: clean, dedupe, language detection, clause splitting, aspect detection (keyword lexicon + embedding similarity), aspect sentiment (pre-trained ABSA model from Hugging Face — research which models are well-used, test that one loads and runs on CPU, record the choice, size and licence in an ADR), overall sentiment.
- Each run creates an AnalysisRun row (start/end time, model versions, counts, status) and writes results linked to it. Re-running does not duplicate results.
- Progress bar, batching, embedding cache on disk, clear logs.
- pytest unit tests per step (clause splitting examples, cleaning edge cases, lexicon matches) and a contract test that the DB tables/columns used by the pipeline exist.

Done when:
- `python -m pipeline run --provider demo` processes the full demo dataset on my laptop; print runtime and per-step counts.
- Spot-check: print 15 random reviews with detected aspects and sentiments so I can judge quality by eye.
- Compared against the hidden ground-truth labels from Stage 2, print rough precision/recall per aspect (this is a sanity check only, not the real evaluation — explain why in INTERVIEW_NOTES).
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 4 — Real data provider + gold evaluation set

```
Stage 4: real data collection and honest evaluation.

Build:
- GooglePlayProvider using a maintained Python library for public Google Play reviews. Requirements: small polite volume (configurable cap, default 2,000 reviews per app), delays between requests, retries with backoff, store only the fields allowed by CLAUDE.md §4 (no usernames/IDs), record source + collected_at. Add a clear note in README that the user is responsible for checking the source's terms of service before collecting.
- Config file listing real apps (Zepto, Blinkit, Swiggy Instamart, BigBasket) with their package IDs — look these up and confirm them rather than guessing. Real data goes into a separate market "Quick Commerce (Live data)" so it never mixes with the demo market.
- A labelling helper: a small CLI (or a simple local page) that shows me one review at a time and lets me record aspects + sentiment into services/pipeline/eval/gold.csv. Sample 200 real English reviews stratified by competitor and rating. Do NOT pre-fill labels with model predictions (that would bias the gold set) — explain why in INTERVIEW_NOTES.
- `python -m pipeline eval`: per-aspect precision/recall/F1, overall sentiment macro-F1, confusion matrix, comparison against a baseline (keyword lexicon + VADER), written to docs/EVALUATION.md.

Done when: collection works for at least one app end to end; I have labelled the gold set (I will do this myself — tell me how, step by step, and pause); eval runs and EVALUATION.md shows model vs baseline. If the model does not beat the baseline on some aspect, say so honestly and suggest one improvement.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 5 — Aggregation, trends, topics, insights

```
Stage 5: pipeline steps 8–11 of CLAUDE.md §6, implementing CLAUDE.md §5 exactly.

Build:
- Aggregates per competitor × aspect × period (week and month) with counts, score, Wilson intervals, confidence label, share of voice.
- Emerging issue detection with the two-proportion z-test; store statistic and p-value.
- Competitive gaps and market-wide weaknesses.
- Topic discovery on negative clauses; store topics with top keywords and example review IDs.
- Template-based insight generator producing typed insights (OBSERVATION / INTERPRETATION / OPPORTUNITY / RECOMMENDATION) with evidence review IDs, n, date range, confidence. Interpretations and recommendations must be phrased as suggestions.
- LLMProvider interface with Anthropic, OpenAI, and None implementations, selected by env var. If configured, the LLM only rewrites template text; a validator rejects any LLM output containing numbers not present in the input facts. With no key, everything still works.
- docs/METRICS.md explaining every formula in plain English with a worked example.

Done when:
- On the demo dataset, ALL FOUR planted signals from docs/DEMO_DATA.md are detected, and nothing obviously false is flagged. Write a pytest that asserts this.
- Unit tests for score formula, Wilson interval, z-test, gap rule, minimum-sample rule (with hand-calculated expected values).
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 6 — Authentication and workspaces

```
Stage 6: auth and workspace isolation.

Build:
- Email + password sign-up/login (and GitHub OAuth if simple) using a current, well-maintained auth library for Next.js — choose one, justify it in an ADR. Secure password hashing, session handling, CSRF protection as the library provides, rate limiting on auth routes.
- Workspace model: a user belongs to one or more workspaces with a role (owner, member). Workspace switcher in the top bar.
- Data-access layer in apps/web/server/: every function takes the session, resolves the active workspace, and scopes every query. Route handlers and server components use only this layer.
- "Explore demo" one-click entry that logs into a read-only demo workspace (write actions disabled with a tooltip).
- Auth pages styled per CLAUDE.md §7, with proper validation messages.

Done when: Vitest tests prove a user cannot read or modify another workspace's competitors, reviews, insights, or reports (try direct ID access); Playwright e2e covers signup, login, logout, demo entry.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 7 — App shell and dashboard

```
Stage 7: app shell and the Competitive Overview dashboard.

Build:
- App shell: sidebar (Overview, Competitors, Reviews, Insights, Compare, Trends, Reports; bottom: Settings, user menu), top bar (global search, date range picker, notifications listing new emerging issues from the latest analysis run, workspace switcher), mobile drawer navigation, persistent "Demo dataset — synthetic" banner when viewing demo data, footer line showing last analysis run time.
- Dashboard with a clear hierarchy, not a grid of random cards:
  1. Header: market, number of competitors, date range, data freshness.
  2. Market sentiment over time (stacked or line chart, per competitor toggle).
  3. Competitive health table: competitor, overall sentiment, avg rating, top strength, top weakness, review count — sortable.
  4. Top customer drivers (aspects by share of voice, with sentiment split).
  5. Emerging issues (with statistic summary and link to evidence).
  6. 3–5 opportunities (labelled OPPORTUNITY, linked to evidence).
- All data via server components / cached server functions through the data-access layer. Date range changes the data.
- Loading skeletons, empty state ("No competitors tracked yet" → Add competitor), error state with retry.

Done when: dashboard loads in under ~1 s locally with the demo data; every number traces to SQL; checked at 1440 px, 1024 px, 768 px and 390 px widths; keyboard navigation works through the sidebar and table.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 8 — Competitors and Customer Voice

```
Stage 8: competitor management and competitor profiles.

Build:
- Competitors list + add/edit/archive competitor (name, market, data sources such as a Play Store package ID or CSV upload). Adding a competitor explains that analysis runs via the pipeline and shows its status ("Awaiting first analysis run").
- Competitor profile with tabs: Overview, Customer Voice, Strengths, Weaknesses, Trends, Competitive Position.
- Customer Voice: sentiment distribution; aspect score table with score bar, n, confidence label and Wilson interval on hover (no star ratings for computed scores — stars are reserved for user ratings); representative review excerpts per aspect, with detected aspect highlighted in the text and its sentiment.
- Strengths / Weaknesses: ranked per CLAUDE.md §5, each with evidence count, confidence, trend direction, and "View reviews" linking to the filtered review explorer.
- Competitive Position: this competitor vs market median per aspect.

Done when: every element has evidence links; low-data aspects show "Not enough data (n = X)"; planted signals are visible on the right profiles.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 9 — Review Explorer

```
Stage 9: review explorer.

Build:
- Filters: competitor, sentiment, aspect, aspect sentiment, rating, date range, source, language, keyword search. Filters live in the URL (shareable, back button works).
- Server-side cursor pagination (never load all reviews into the browser); Postgres full-text search for keywords with proper indexes; debounced search input.
- Each review row: rating, date, source, app version, overall sentiment, detected aspects as small labelled tags with their sentiment, text with aspect phrases highlighted. Expand a row to see clause-level analysis and model confidence.
- Result count, CSV export of the current filtered set (streamed, capped, workspace-scoped).
- Empty state for no results with a "Clear filters" action.

Done when: filtering 6,000+ reviews responds quickly (check query plans with EXPLAIN and add indexes if needed); Playwright test covers filtering and search.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 10 — Compare, Gaps and Trends

```
Stage 10: comparison engine, gap analysis, trends.

Build:
- Compare: pick 2–4 competitors; side-by-side table of overall rating, sentiment, and each aspect score with intervals; grouped bar chart per aspect; cells coloured only when the difference is meaningful per CLAUDE.md §5.
- Competitive gap matrix (competitors × aspects heatmap-style table with numbers visible), followed by "Biggest gaps" and "Market-wide weaknesses" written as typed insights with evidence.
- Trends: ranges 7d / 30d / 90d / 6m / 1y; charts for sentiment, complaint share by aspect, average rating, and discovered topics over time; emerging issues marked on the chart with their p-value in the tooltip; "Uncategorised themes" section from topic discovery.

Done when: planted competitive gap, market-wide weakness and the app-version drop are clearly visible; charts have accessible data-table alternatives.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 11 — Insights and SWOT

```
Stage 11: insights page and evidence-based SWOT.

Build:
- Insights feed with filters by type, competitor, aspect, confidence. Each insight card: type label, statement, evidence (n, date range, sources, link to reviews), confidence, impact, suggested investigation. Interpretations/opportunities/recommendations show "Analytical suggestion — not verified market fact".
- SWOT per competitor built only from computed findings: Strengths/Weaknesses from aspect rankings, Opportunities from competitor weaknesses and market-wide gaps, Threats from rivals' strengths and emerging issues. Every item links to its evidence.
- Settings → AI provider: choose None / Anthropic / OpenAI; keys are entered as server-side environment variables (explain how), never stored in the browser. Show which provider wrote the current insight wording.

Done when: switching to no LLM still shows complete insights; tests confirm no insight is rendered without evidence.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 12 — Reports

```
Stage 12: report generator.

Build:
- Report builder: choose market, competitors, date range, sections (Executive Summary, Market Overview, Competitor Overview, Customer Sentiment, Strengths, Weaknesses, Emerging Issues, Competitive Gaps, Strategic Opportunities, Conclusion, Sources & Methodology).
- Report view styled like a consulting deliverable: cover page, table of contents, numbered sections, charts, evidence footnotes, methodology section that explains the metrics and the pipeline's evaluation scores, a data-source statement (demo vs live), generated date and analysis run ID.
- Export: PDF generated server-side in a way that works when deployed on Vercel (no full headless browser unless you confirm it fits — justify the choice in an ADR); CSV of underlying aggregates; share link (random token, read-only, revocable, optional expiry).
- Reports are saved and listed with status.

Done when: I can generate, open and download a PDF for the demo market and it looks professional; share link works logged-out and stops working after revoking.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 13 — Landing page

```
Stage 13: marketing site.

Build pages in the (marketing) route group:
- Hero: "Know what your competitors' customers really think." Supporting line: "RivalSense turns public customer feedback into competitive intelligence — strengths, weaknesses, emerging problems and opportunities across your market." CTAs: "Start analyzing" (signup) and "Explore demo" (demo login).
- A real screenshot-style preview built from actual app components rendering demo data (not a fake image).
- How it works (5 steps), capabilities (sentiment, aspect analysis, comparison, trend detection, pain points, opportunities) each with a concrete one-line example, example report excerpt, methodology & responsible data use section (what we collect, what we don't, how scores are computed, model evaluation results), pricing (3 static tiers, clearly no checkout — buttons go to signup or "Contact"), enterprise-style footer.
- Copy rules from CLAUDE.md §7. Fast: static rendering, optimised fonts and images, good Lighthouse scores.

Done when: Lighthouse performance and accessibility ≥ 90 on desktop and mobile; checked at all breakpoints; no hype copy.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 14 — Quality audit

```
Stage 14: full audit and fixes. Go through each area, fix problems, and record what you changed:

- Tests: fill gaps so unit tests cover metrics, aggregation, comparison, auth/authorization, API validation, report generation; e2e covers signup, login, add competitor, dashboard, review filtering, report generation. All green.
- Security: authorization on every route and server action, input validation, rate limits, no secrets in client bundles (search the build output), security headers, safe error messages.
- Performance: query plans for the slowest pages, indexes, caching of aggregate reads, bundle size, lazy-loaded charts.
- Accessibility: keyboard pass of every page, axe checks in Playwright, contrast in light and dark mode.
- UX consistency: spacing, typography, empty/loading/error states on every data view, mobile navigation, no dead buttons (list every button and what it does).
- Data integrity: grep for hard-coded numbers in components; confirm the demo banner appears everywhere demo data is shown.

Done when: everything above passes and PROGRESS.md lists any remaining known limitation honestly.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Stage 15 — Deployment and documentation

```
Stage 15: deploy and document.

- Deploy the web app to Vercel and the database to a free managed Postgres (e.g. Neon). Run migrations and seed the demo market in production. The pipeline runs locally (or via a manual GitHub Actions workflow) against the production database URL — document both.
- Walk me through each step with exact clicks and PowerShell commands; pause where I need to create accounts or paste secrets myself.
- Final README: what RivalSense is, screenshots, live demo link, architecture diagram, tech stack, how the NLP pipeline works, evaluation results table, how to run locally, how to add a new data provider, limitations and future work (multilingual models, more sources).
- docs/API.md documenting every route handler: method, path, params, response shape, errors, auth requirement.
- Give me 3 resume bullet points with real numbers from this project (dataset size, eval scores, runtime) — no inflated claims.

Done when: the live demo works logged-out via "Explore demo" and a recruiter can understand the project from the README in two minutes.
Commit, update PROGRESS.md and INTERVIEW_NOTES.md.
```

---

## Resume prompt (use when coming back after a break)

```
Read CLAUDE.md and PROGRESS.md. Run git log --oneline -15 and git status. Tell me: which stage we are in, what is finished, what is half-done, whether the app and tests currently run, and the exact next step. Then wait for my go-ahead before changing anything.
```

## If something breaks

```
Something is broken: [paste the error and what you were doing]. Reproduce it first, find the root cause, explain it to me in simple terms, then fix it and add a test so it does not come back. Do not change unrelated code.
```

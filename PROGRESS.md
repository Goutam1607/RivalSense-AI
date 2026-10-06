# Progress

Last updated: 5 Oct 2026. Stages from PROMPTS.md.

| Stage | Status | Notes |
|---|---|---|
| 0 — Plan | ✅ Done | docs/ARCHITECTURE.md, docs/DATA_MODEL.md, risks below. |
| 1 — Foundation | ✅ Done | Monorepo, Next.js 16 + TS strict + Tailwind 4, Prisma 7 schema + migrations, `db:*` scripts (Docker or embedded Postgres), zod env loader, design tokens (light/dark), `/dev/design-system`, `.env.example`. shadcn-style components written by hand on Radix (no generator). |
| 2 — Demo dataset + seed | ✅ Done | Deterministic generator (6,458 reviews, 4 fictional apps, Hinglish, typos, emoji, dupes, spam, 5 planted signals), hidden ground truth, idempotent seed (~4 s) that also re-syncs changed rows. docs/DEMO_DATA.md. |
| 3 — NLP pipeline core | ✅ Done | Steps 1–7, providers demo/csv/google_play/db, AnalysisRun tracking, disk cache, progress bars, spot check, synthetic sanity scores. |
| 4 — Real data + gold set | ✅ Done | 1,200 real Google Play reviews collected and analysed. `eval/gold.csv`: 200 real reviews labelled by an AI annotator (Claude) that never saw model output. Results in docs/EVALUATION.md: aspect micro-F1 0.68 (baseline 0.66), aspect sentiment acc 0.85 (0.60), overall macro-F1 0.76 (0.60). Labels human-verified by Goutam; eval re-run with `run_eval.bat` (numbers unchanged). |
| 5 — Aggregation, trends, topics, insights | ✅ Done | Aggregates, emerging issues (z-test), app-version drops (BH), gaps, market weaknesses, topics, typed insights with evidence, LLMProvider (Anthropic/OpenAI/none) with number validator. All 4 planted signals asserted by pytest. docs/METRICS.md. |
| 6 — Auth + workspaces | ✅ Done | Better Auth (email/password, optional GitHub), rate limits, workspace switcher, data-access layer, Explore demo (read-only). Vitest isolation tests + Playwright auth flows. |
| 7 — App shell + dashboard | ✅ Done | Sidebar, mobile drawer, top bar (search, date range, notifications, workspace/market switcher), demo banner, last-run footer, dashboard sections, skeleton/empty/error states. |
| 8 — Competitors + Customer Voice | ✅ Done | List, add (Play ID or CSV upload), edit, archive; profile tabs Overview / Customer Voice / Strengths / Weaknesses / Trends / Competitive Position. |
| 9 — Review explorer | ✅ Done | URL filters, cursor pagination, Postgres full-text search (GIN index), highlighted aspects, clause analysis, streamed CSV export, empty state. |
| 10 — Compare, gaps, trends | ✅ Done | Compare 2–4, gap matrix, grouped bars, trends 7d–1y with emerging-issue markers, themes over time, uncategorised themes, table alternatives for charts. |
| 11 — Insights + SWOT | ✅ Done | Filterable feed, evidence-based SWOT per competitor, Settings → AI provider. |
| 12 — Reports | ✅ Done | Builder, consulting-style view, server-side PDF (react-pdf), CSV, revocable share links with expiry. |
| 13 — Landing page | ✅ Done | Static (ISR) landing with a live preview built from real components + demo data. Lighthouse not yet run (no Lighthouse CLI in this session). |
| 14 — Quality audit | 🟡 Partly done | lint, typecheck, Vitest 24/24, pytest 40/40, Playwright 12/12 (incl. axe on 5 pages), production build, client-bundle secret scan all pass. Not done yet: Lighthouse scores, full keyboard walk-through of every page, query-plan review with EXPLAIN on a larger dataset. |
| 15 — Deploy + docs | 🟡 Docs done, not deployed | README, docs/API.md, docs/DEPLOYMENT.md, ADRs, CI + manual pipeline workflow written. Deployment needs your Vercel/Neon accounts. |

## Next steps for you
1. Deploy (docs/DEPLOYMENT.md).
2. Run Lighthouse on the landing page (Chrome DevTools → Lighthouse) and fix anything below 90.

## Known issues / limitations
* Only English reviews are analysed; Hinglish/Hindi are counted as “not yet analysed”.
* The ABSA model labels some implicit complaints as neutral (e.g. “still waiting for my refund”); this dilutes refund
  complaint counts. Visible in the evaluation; suggested fix is a small fine-tune or a rule for “waiting/still/never got”.
* Aspect detection on synthetic data is optimistic (shared vocabulary); real numbers await the gold set.
* Emerging-issue detection uses calendar windows anchored at the latest review; a market with very little recent data
  will rarely produce findings (by design: ≥ 20 negative mentions).
* Port 3000 on the development laptop was used by another local Node process during development, so testing used
  port 3100 (`BETTER_AUTH_URL` must match the port you use).
* The old prototype in `backend/` and `frontend/` (random mock data, contradicted CLAUDE.md §4) is not part of the
  new app and is excluded from git; it can be deleted.

## Risks identified at the start (and how they were handled)
| Risk | Handling |
|---|---|
| Model size / speed on CPU | Batched, length-sorted inference, physical-core threads, shorter max lengths, SQLite inference cache → 7.4 min cold / 40 s warm for 6.4k reviews. |
| Windows tooling (no Docker, Node 23 EOL, path/encoding quirks) | Embedded Postgres fallback, Node 24 via fnm + `.node-version`, Node scripts instead of shell, UTF-8 console output. |
| Circular evaluation on synthetic data | Separate gold set of real reviews, labelled (AI-assisted) without seeing model output; synthetic scores labelled “optimistic”. |
| Fabricated or misleading numbers | No hard-coded numbers in UI; minimum sample rule; typed insights; LLM number validator; demo banner + export labels. |
| Data-collection ethics | Small caps, delays, no identities, ToS notice, fictional names for synthetic data. |

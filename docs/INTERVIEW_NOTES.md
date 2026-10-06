# Interview notes

Numbers to remember (October 2026 build):

* **Demo dataset:** 6,458 synthetic reviews, 4 fictional apps, 12 months; 5,803 analysed in English, 504 Hinglish/Hindi set aside, 89 duplicates and 62 spam removed.
* **Pipeline runtime (CPU laptop):** 7.4 min cold for 6,450 reviews (10,100 clauses), ≈ 40 s with the cache.
* **Live data:** 1,200 real Google Play reviews (300 each for Zepto, Blinkit, Swiggy Instamart, BigBasket), 1,119 analysed.
* **Synthetic sanity scores (optimistic):** aspect detection F1 0.89 (P 0.96 / R 0.83); aspect sentiment accuracy 0.87 vs 0.49 for VADER; overall sentiment macro-F1 0.70 vs 0.49.
* **Tests:** 40 pytest, 24 Vitest, 12 Playwright (with axe).
* **Gold set:** 200 real reviews sampled across 20 app × rating strata — to be labelled.

---

## Stage 0–1 — Plan and foundation
**What and why.** A monorepo: a Python batch pipeline does the NLP and writes results to PostgreSQL; a Next.js app only
reads them. Prisma owns the schema so there is one source of truth for both languages.

* **Why is analysis a batch job instead of running on each request?** The models are ~800 MB and take seconds per
  hundred texts on a CPU. Running them offline keeps pages fast, keeps ML out of serverless functions and makes every
  number reproducible from a stored analysis run.
* **Why Prisma if Python also writes to the DB?** One schema definition and migration history; Python uses plain SQL and
  a contract test fails if a table/column it uses disappears.
* **How did you handle not having Docker?** `npm run db:up` uses Docker when available, otherwise starts a real
  PostgreSQL from npm-shipped binaries (ADR 002) — same SQL as production.
* **What are design tokens?** Named CSS variables (colours, type scale, radii) defined once with light and dark values,
  so components never hard-code colours and dark mode is a variable swap.

## Stage 2 — Synthetic demo data
**What and why.** A deterministic generator writes realistic reviews from ~300 templates with slot filling, typos,
emoji, Hinglish, duplicates and spam, plus a hidden label file. It plants known signals so later stages can prove they work.

* **Why synthetic data at all?** To demo safely (fictional companies, no invented claims about real brands) and to test
  the pipeline against known answers.
* **What is a planted signal?** A pattern deliberately put into the data — e.g. Kwikr's refund complaints ramp up in the
  last 90 days — that the analysis must find. A pytest checks all four are detected.
* **How is seeding idempotent?** Reviews have a stable `(data_source, external_key)` unique key; `createMany` skips
  duplicates and changed rows are updated, so running twice changes nothing.
* **What is a confound you saw?** Kwikr shipped v12.5.0 during the refund ramp, so the version test also “finds” a
  version effect — a time trend can masquerade as a release problem.

## Stage 3 — NLP pipeline core
**What and why.** Eleven modular steps: clean → language → clauses → aspects (lexicon + embeddings) → aspect sentiment
(ABSA) → overall sentiment, each tested, batched and cached.

* **Why split into clauses?** “Fast delivery but the refund took three days” has two opinions; splitting at contrast
  words lets each aspect get its own sentiment and lets the UI highlight exactly where it was said.
* **Why two layers for aspect detection?** Keywords are precise but miss paraphrases; embeddings catch “my groceries
  showed up before my tea was ready” (delivery speed). The layer that fired is stored.
* **What is ABSA?** Aspect-based sentiment analysis: the model gets (sentence, aspect) and returns the sentiment towards
  that aspect, so one sentence can be positive about delivery and negative about refunds.
* **Why do you feed ABSA the sentence and not the clause?** Testing showed splitting “the refund was processed | but I
  never got the money” left a positive-sounding clause; the ABSA model is trained to separate aspects in full sentences.
* **Why is the synthetic score only a sanity check?** The test reviews came from my own templates and the lexicon shares
  their vocabulary, so it is circular — the real test is labelled real reviews (the gold set).

## Stage 4 — Real data and evaluation
**What and why.** A Google Play provider collects a small, polite sample of public reviews storing only text, rating,
date and version; a stratified sample is labelled (AI-assisted, blind to model output) to measure precision, recall and F1 against a baseline.

* **Why not pre-fill labels with model predictions?** Anchoring: labellers tend to accept what they see, which would make
  the model look better than it is. Blank labels keep the gold set independent.
* **What baseline did you use and why?** Keyword lexicon + VADER — simple, transparent, widely known. A model is only
  worth its cost if it beats this.
* **Precision vs recall?** Precision: of the aspects I tagged, how many were right. Recall: of the aspects really
  mentioned, how many I found. F1 is their harmonic mean.
* **Why macro-F1 for sentiment?** It averages F1 per class, so the small neutral class counts as much as positive.
* **How do you collect data responsibly?** Volume cap, delays, retries with backoff, no proxies or CAPTCHA bypass, no
  usernames/IDs stored, ToS responsibility stated in the README.

## Stage 5 — Metrics, trends, topics, insights
**What and why.** Mentions become 0–100 scores with Wilson intervals; z-tests flag emerging issues; HDBSCAN finds themes
outside the categories; templates turn findings into typed insights with evidence.

* **What is a Wilson interval and why not a plain percentage?** A 95% range for a proportion that stays inside 0–100%
  and is honest for small samples; 8/10 positive is “49–94%”, not a confident 80%.
* **How do you decide a complaint is really rising?** Negative mentions per review in the last 30 days vs the previous
  30, needing ≥ 20 mentions, ≥ 25% relative increase and a two-proportion z-test with p < 0.05.
* **Why Benjamini–Hochberg for app versions?** Hundreds of version × aspect tests would produce false alarms at p < 0.05;
  BH controls the expected share of false discoveries at 5%.
* **What is a competitive gap?** A score ≥ 10 points from the median of the other competitors with non-overlapping
  intervals — big enough to matter and unlikely to be noise.
* **How do you stop an LLM from inventing numbers?** It only rewords template text given the computed facts, and any
  output containing a number not present in those facts is rejected; with no API key everything uses templates.
* **Observation vs interpretation?** Observations are computed facts and may state numbers; interpretations,
  opportunities and recommendations are suggestions, carry no numbers and are labelled as such.

## Stage 6 — Auth and workspaces
**What and why.** Better Auth handles sign-up, login, sessions and rate limits; every data function is scoped to the
user's workspace through one data-access layer.

* **How do you stop one workspace from reading another's data?** The active workspace comes from a cookie but is always
  re-checked against the user's memberships, every query filters by it, and raw SQL re-checks `market.workspace_id`.
  Tests try direct IDs and forged contexts and expect nothing back.
* **How are passwords stored?** Never in plain text: Better Auth hashes them with scrypt (salted, slow by design).
* **What does the proxy (middleware) do?** Only a cheap “is there a session cookie” redirect; real authorisation is in
  the server layer because a cookie's presence proves nothing.
* **Why is the demo read-only?** Everyone shares it; blocking writes keeps it intact while still letting visitors make
  private reports.

## Stages 7–11 — Product UI
**What and why.** Server components fetch through the data-access layer; client components handle charts and filters.
Every metric shows n, intervals, sources, the date range and the last analysis run.

* **Why keep filters in the URL?** Shareable views and a working back button, and the server can render the filtered
  page directly.
* **How is the review explorer fast on thousands of rows?** Server-side cursor pagination on `(reviewed_at, id)`, a
  composite index, and a GIN full-text index; the browser only ever gets 25 rows.
* **Why “Not enough data (n = X)” instead of a number?** Below 30 mentions the interval is too wide to be meaningful;
  hiding the score avoids false precision.
* **How is colour used?** Neutral greys by default; green/red/amber only for meaning and always with a label or icon;
  the categorical chart palette was validated for colour-blind separation in light and dark modes.

## Stage 12 — Reports
**What and why.** A report freezes all computed numbers into a snapshot, renders as a consulting-style page and a
server-side PDF, and can be shared via a revocable token.

* **Why freeze a snapshot?** A report should not change when the pipeline re-runs next week.
* **Why @react-pdf instead of headless Chrome?** It is pure JavaScript and fits in a serverless function; headless Chrome
  is large and slow to cold-start (ADR 005).
* **How are share links secure?** 32 random bytes (base64url) per link, read-only page, optional expiry, revocation is
  checked on every request, and access is counted.

## Stages 13–15 — Landing, audit, deployment
* **How is the landing preview “real”?** It renders the actual dashboard components with demo data at build time
  (re-generated hourly), not a screenshot.
* **What did the audit check?** Lint, types, unit/integration/e2e tests, axe accessibility, a production build, and a
  scan of the client bundle for secrets.
* **How do you deploy a Python pipeline with a Vercel app?** The web app goes to Vercel and the database to Neon; the
  pipeline runs on a laptop or a manual GitHub Actions job against the production database URL.

## Stage 4 (completed) — Gold-set evaluation results
**What and why.** 200 real Google Play reviews were labelled with AI assistance (the annotator saw only the review text
and star rating, never the model's output), then checked by hand. The pipeline and a keyword + VADER baseline are
scored against these labels, so the accuracy numbers come from real reviews, not from our own templates.

* **How were the gold labels made?** AI-assisted labelling, then human verification. The annotator never saw model
  predictions, which avoids anchoring. There was one annotator, so I can't report inter-annotator agreement. That's a
  known limitation.
* **Is the model better than the baseline?** For sentiment, clearly: overall macro-F1 0.76 vs 0.60, aspect sentiment
  accuracy 85% vs 60%. For aspect *detection*, only slightly: micro-F1 0.68 vs 0.66.
* **What is the weakest part?** Aspect recall (0.59). Precision is 0.80, so when it tags an aspect it is usually right,
  but it misses many. On 7 of 10 aspects the model scores the same as the keyword-only baseline, so the embedding layer
  rarely adds anything on real text.
* **What would you improve next?** Tune the embedding-similarity threshold for recall, add real-world phrasings and
  misspellings ("delevery", "sarvice") to the lexicon, and handle implicit complaints ("still waiting for my refund")
  that the ABSA model labels neutral.
* **Why not quote the synthetic score (0.88)?** It is circular: those reviews come from my own templates.

**Numbers to remember:** gold set n = 200 real reviews · aspect micro-F1 0.68 (P 0.80, R 0.59; baseline 0.66) ·
aspect sentiment accuracy 0.85 (baseline 0.60) · overall sentiment macro-F1 0.76 (baseline 0.60), accuracy 83%.

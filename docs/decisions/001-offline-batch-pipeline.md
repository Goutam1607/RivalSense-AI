# 001 — Analysis as an offline batch pipeline in a monorepo

**Context.** The NLP models (~800 MB) need seconds per hundred texts on a CPU. Pages must load in about a second and
numbers must be reproducible.

**Options.** (a) Run models inside API routes; (b) a separate always-on Python API; (c) an offline batch pipeline
writing results to the shared database.

**Decision.** (c). `services/pipeline` writes results tagged with `analysis_run_id`; the Next.js app reads them.
Prisma owns the schema; Python uses parameterised SQL checked by a contract test.

**Consequences.** Fast pages, no ML in serverless functions, cheap hosting. New data appears only after a run
(the UI says “Awaiting first analysis run” and shows the last run time). Two languages to maintain; metric formulas
are duplicated in Python and TypeScript and tested against the same values.

# 006 — Toolchain versions

**Context.** The laptop had Node 23.6 (an odd-numbered, end-of-life release). Prisma 7 requires Node 20.19+/22.12+/24+
and Vitest 5 requires 22.12+/24+; npm's latest tag for Prisma pointed at an 8.0 release candidate.

**Decision.** Node **24 LTS** for this repo, installed with `fnm` and pinned in `.node-version` (the global Node is left
untouched). Next.js 16.3, React 19.2, Prisma **7.10** (latest stable, not the 8.0 RC), Better Auth 1.7, Tailwind 4,
TypeScript 5.9, Python 3.11 with pinned `requirements.txt` (CPU-only PyTorch wheel).

**Consequences.** `fnm use` (or any Node 24) is required before `npm install`. Prisma 7 needs the `pg` driver adapter
and generates the client into `apps/web/server/db/generated` (git-ignored, regenerated on `npm install`).

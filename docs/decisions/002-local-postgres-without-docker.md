# 002 — Local PostgreSQL with or without Docker

**Context.** CLAUDE.md assumes Docker Desktop, but the development laptop did not have Docker installed.

**Options.** (a) Require Docker; (b) require a manual PostgreSQL install; (c) SQLite locally; (d) start a real
PostgreSQL from npm-distributed binaries when Docker is missing.

**Decision.** (d) with (a) as the preferred path: `npm run db:up` (`scripts/db.mjs`) uses `docker compose` when Docker
is running, otherwise initialises and starts PostgreSQL 18 from the `embedded-postgres` binaries in `.data/postgres`
(`pg_ctl`, scram-sha-256, same `DATABASE_URL`). `DB_MODE=docker|embedded` forces a mode.

**Consequences.** Works on a fresh Windows machine with only Node installed; identical SQL to production (SQLite would
lack `tsvector`, arrays and `date_trunc`). The embedded server must be started after a reboot (`npm run db:up`).

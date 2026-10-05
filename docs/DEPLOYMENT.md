# Deployment (Vercel + Neon)

The web app runs on Vercel; the database on a free Neon Postgres. The NLP pipeline does **not** run on Vercel — you run
it from your laptop (or the manual GitHub Actions workflow) against the production database URL.

> Steps marked **(you)** need you to create an account or paste a secret. Nothing is deployed automatically.

## 1. Database on Neon **(you)**
1. Sign up at neon.tech → **Create project** → region close to your Vercel region (e.g. AWS ap-south-1, Mumbai).
2. **Connection details** → copy the *pooled* connection string. Add `&connect_timeout=15` if missing. It looks like
   `postgresql://user:pass@ep-xxx-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require`.
3. Apply migrations and load the demo market from your laptop (PowerShell, repo root):
   ```powershell
   $env:DATABASE_URL = "postgresql://...neon.tech/neondb?sslmode=require"
   npm run db:deploy        # prisma migrate deploy
   npm run seed             # demo workspace, demo user, 6,458 synthetic reviews
   cd services/pipeline
   .\.venv\Scripts\Activate.ps1
   python -m pipeline run --provider demo     # ~8 minutes first time; writes results to Neon
   python -m pipeline eval                    # stores evaluation summary for reports
   Remove-Item Env:DATABASE_URL
   ```

## 2. Web app on Vercel **(you)**
1. Push the repository to GitHub (see README “Git”).
2. vercel.com → **Add New… → Project** → import the repo.
3. **Root Directory:** `apps/web`. Framework: Next.js (auto). Leave build command as default (`next build`).
   Install command: `cd ../.. && npm install` (workspaces install from the repo root and run `prisma generate`).
4. **Environment Variables** (Production):
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled URL |
   | `BETTER_AUTH_SECRET` | 48+ random characters (`[Convert]::ToBase64String((1..48 \| % { Get-Random -Max 256 }))`) |
   | `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` |
   | `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | same values you seeded with |
   | `LLM_PROVIDER` | `none` (or `anthropic` + `ANTHROPIC_API_KEY`) |
5. **Deploy.** Then open `https://<project>.vercel.app` → **Explore demo**.

## 3. Running the pipeline later
* **Laptop:** set `DATABASE_URL` to the Neon URL as above and run any `python -m pipeline …` command.
* **GitHub Actions:** repo → Settings → Secrets and variables → Actions → **New repository secret**
  `DATABASE_URL` (and optionally `ANTHROPIC_API_KEY`). Then Actions → *Run analysis pipeline* → **Run workflow**,
  provider `demo` (or `db` with a market slug). The workflow caches the downloaded models between runs.

## Checks after deploying
* `GET /api/health` → `{"status":"ok","database":"ok"}`
* Landing page shows the live preview table (data from the demo market).
* “Explore demo” works logged-out; dashboard shows “Last analysis run …” in the footer.
* Generate a report → Download PDF → create a share link → open it in a private window → revoke → link stops working.

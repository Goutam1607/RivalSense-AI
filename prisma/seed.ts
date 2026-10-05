/**
 * `npm run seed` — loads the synthetic demo market. Idempotent: running it twice
 * does not duplicate anything (upserts + createMany skipDuplicates on a stable key).
 *
 * 1. Generates the demo dataset with the Python generator if it is missing.
 * 2. Creates the read-only demo workspace + demo user (credentials from .env).
 * 3. Creates market, aspect categories, competitors and data sources.
 * 4. Batch-inserts the reviews and prints a SQL summary.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../apps/web/server/db/generated/client";

const root = path.resolve(__dirname, "..");
const pipelineDir = path.join(root, "services", "pipeline");
const generatedDir = path.join(pipelineDir, "data", "generated");
const reviewsFile = path.join(generatedDir, "demo_reviews.jsonl");

type MarketConfig = {
  aspects: { key: string; label: string; description: string; seedKeywords: string[] }[];
  demo: {
    market: { name: string; slug: string; description: string };
    competitors: { slug: string; name: string; description: string }[];
  };
};

type DemoReview = {
  external_key: string;
  competitor: string;
  text: string;
  rating: number;
  reviewed_at: string;
  app_version: string | null;
};

const DEMO_SOURCE_LABEL = "Demo dataset — synthetic";

function findPython(): string {
  const venv =
    process.platform === "win32"
      ? path.join(pipelineDir, ".venv", "Scripts", "python.exe")
      : path.join(pipelineDir, ".venv", "bin", "python");
  if (existsSync(venv)) return venv;
  for (const candidate of ["python", "python3", "py"]) {
    if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) return candidate;
  }
  throw new Error("Python 3.11+ is required to generate the demo dataset. Install it and re-run `npm run seed`.");
}

function ensureDemoData() {
  if (existsSync(reviewsFile)) return;
  console.log("Demo dataset not found — generating it with the Python generator ...");
  const r = spawnSync(findPython(), ["-m", "pipeline", "generate-demo"], { cwd: pipelineDir, stdio: "inherit" });
  if (r.status !== 0) throw new Error("Demo data generation failed.");
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return v;
}

async function main() {
  const started = Date.now();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: required("DATABASE_URL") }) });
  const config = JSON.parse(readFileSync(path.join(root, "config", "markets", "quick-commerce.json"), "utf8")) as MarketConfig;
  ensureDemoData();

  // ── Workspace + demo user ──
  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo" },
    update: { isDemo: true },
    create: { slug: "demo", name: "Demo workspace", isDemo: true },
  });

  const email = required("DEMO_USER_EMAIL").toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const id = randomUUID();
    user = await prisma.user.create({
      data: {
        id,
        email,
        name: "Demo viewer",
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password: await hashPassword(required("DEMO_USER_PASSWORD")),
          },
        },
      },
    });
  }
  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: {},
    create: { userId: user.id, workspaceId: workspace.id, role: "MEMBER" },
  });

  // ── Market, aspects, competitors, sources ──
  const m = config.demo.market;
  const market = await prisma.market.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: m.slug } },
    update: { name: m.name, description: m.description },
    create: { workspaceId: workspace.id, slug: m.slug, name: m.name, description: m.description, dataKind: "DEMO_SYNTHETIC" },
  });

  for (const [i, a] of config.aspects.entries()) {
    await prisma.aspectCategory.upsert({
      where: { marketId_key: { marketId: market.id, key: a.key } },
      update: { label: a.label, description: a.description, seedKeywords: a.seedKeywords, sortOrder: i },
      create: { marketId: market.id, key: a.key, label: a.label, description: a.description, seedKeywords: a.seedKeywords, sortOrder: i },
    });
  }

  const sourceBySlug = new Map<string, { competitorId: string; dataSourceId: string }>();
  for (const [i, c] of config.demo.competitors.entries()) {
    const competitor = await prisma.competitor.upsert({
      where: { marketId_slug: { marketId: market.id, slug: c.slug } },
      update: { name: c.name, description: c.description, colorIndex: i },
      create: { marketId: market.id, slug: c.slug, name: c.name, description: c.description, colorIndex: i },
    });
    const source = await prisma.dataSource.upsert({
      where: { competitorId_kind: { competitorId: competitor.id, kind: "DEMO" } },
      update: { label: DEMO_SOURCE_LABEL, lastCollectedAt: new Date() },
      create: { competitorId: competitor.id, kind: "DEMO", label: DEMO_SOURCE_LABEL, lastCollectedAt: new Date() },
    });
    sourceBySlug.set(c.slug, { competitorId: competitor.id, dataSourceId: source.id });
  }

  // ── Reviews (batched, idempotent on data_source_id + external_key) ──
  const lines = readFileSync(reviewsFile, "utf8").split("\n").filter(Boolean);
  const reviews = lines.map((l) => JSON.parse(l) as DemoReview);
  const collectedAt = new Date();
  let inserted = 0;
  const BATCH = 2000;
  for (let i = 0; i < reviews.length; i += BATCH) {
    const data = reviews.slice(i, i + BATCH).map((r) => {
      const src = sourceBySlug.get(r.competitor);
      if (!src) throw new Error(`Unknown competitor in demo data: ${r.competitor}`);
      return {
        marketId: market.id,
        competitorId: src.competitorId,
        dataSourceId: src.dataSourceId,
        externalKey: r.external_key,
        text: r.text,
        rating: r.rating,
        reviewedAt: new Date(r.reviewed_at),
        appVersion: r.app_version,
        collectedAt,
      };
    });
    inserted += (await prisma.review.createMany({ data, skipDuplicates: true })).count;
  }
  // If the generator output changed (e.g. templates edited), bring existing rows in line with the file
  // and drop rows that are no longer in it. Changed rows go back to PENDING so the pipeline re-analyses them.
  let synced = 0;
  for (const [slug, src] of sourceBySlug) {
    const mine = reviews.filter((r) => r.competitor === slug);
    synced += await prisma.$executeRaw`
      UPDATE review r SET text = u.text, rating = u.rating, reviewed_at = u.at, app_version = u.ver,
             status = 'PENDING', clean_text = NULL, language = NULL, content_hash = NULL
      FROM unnest(${mine.map((r) => r.external_key)}::text[], ${mine.map((r) => r.text)}::text[],
                  ${mine.map((r) => r.rating)}::int[], ${mine.map((r) => new Date(r.reviewed_at))}::timestamp[],
                  ${mine.map((r) => r.app_version)}::text[]) AS u(key, text, rating, at, ver)
      WHERE r.data_source_id = ${src.dataSourceId}::uuid AND r.external_key = u.key
        AND (r.text IS DISTINCT FROM u.text OR r.rating IS DISTINCT FROM u.rating
             OR r.reviewed_at IS DISTINCT FROM u.at OR r.app_version IS DISTINCT FROM u.ver)`;
    await prisma.review.deleteMany({
      where: { dataSourceId: src.dataSourceId, externalKey: { notIn: mine.map((r) => r.external_key) } },
    });
  }
  console.log(
    `Seeded demo workspace "${workspace.name}", market "${market.name}": ${inserted} new reviews, ${synced} updated (${reviews.length} in file).`,
  );
  console.log(`Demo login: ${email} (password from DEMO_USER_PASSWORD in .env)`);

  // ── Summary straight from SQL ──
  const byCompetitor = await prisma.$queryRaw<{ competitor: string; reviews: bigint; avg_rating: number }[]>`
    SELECT c.name AS competitor, COUNT(*) AS reviews, ROUND(AVG(r.rating)::numeric, 2)::float AS avg_rating
    FROM review r JOIN competitor c ON c.id = r.competitor_id
    WHERE r.market_id = ${market.id}::uuid GROUP BY c.name ORDER BY c.name`;
  console.log("\nReviews per competitor:");
  console.table(byCompetitor.map((r) => ({ ...r, reviews: Number(r.reviews) })));

  const byMonth = await prisma.$queryRaw<{ month: string; reviews: bigint }[]>`
    SELECT to_char(date_trunc('month', reviewed_at), 'YYYY-MM') AS month, COUNT(*) AS reviews
    FROM review WHERE market_id = ${market.id}::uuid GROUP BY 1 ORDER BY 1`;
  console.log("Reviews per month:");
  console.table(byMonth.map((r) => ({ ...r, reviews: Number(r.reviews) })));

  const byRating = await prisma.$queryRaw<{ rating: number; reviews: bigint }[]>`
    SELECT rating, COUNT(*) AS reviews FROM review WHERE market_id = ${market.id}::uuid GROUP BY rating ORDER BY rating`;
  console.log("Reviews per rating:");
  console.table(byRating.map((r) => ({ ...r, reviews: Number(r.reviews) })));

  const byLanguage = await prisma.$queryRaw<{ language: string | null; status: string; reviews: bigint }[]>`
    SELECT COALESCE(language, '(not detected yet)') AS language, status::text AS status, COUNT(*) AS reviews
    FROM review WHERE market_id = ${market.id}::uuid GROUP BY 1, 2 ORDER BY 3 DESC`;
  console.log("Reviews per language / status (language is detected by the pipeline):");
  console.table(byLanguage.map((r) => ({ ...r, reviews: Number(r.reviews) })));

  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

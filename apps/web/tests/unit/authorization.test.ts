/**
 * Workspace isolation, tested against the real database through the data-access layer.
 * Two users each own a workspace with a market, competitor, review, insight and report.
 * User A must not be able to read or modify anything of B's — including by passing B's IDs
 * directly or by forging a context that points at B's market.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertCanWrite, type AppContext, type MarketSummary } from "@/server/context";
import { getAspectMatrix, getCompetitors, getHealthTable } from "@/server/data/analytics";
import { getCompetitorBySlug, listCompetitorsDetailed } from "@/server/data/competitors";
import { getInsightEvidence, listInsights } from "@/server/data/insights";
import { getReport, listReports } from "@/server/data/reports";
import { listReviews } from "@/server/data/reviews";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { resolveWindow } from "@/lib/date-range";

type Fixture = { ctx: AppContext & { market: MarketSummary }; competitorSlug: string; insightId: string; reportId: string; reviewId: string };

const tag = randomUUID().slice(0, 8);
const created: { users: string[]; workspaces: string[] } = { users: [], workspaces: [] };

async function makeTenant(name: string): Promise<Fixture> {
  const userId = `test-${name}-${tag}`;
  await prisma.user.create({ data: { id: userId, name, email: `${name}-${tag}@test.local` } });
  const ws = await prisma.workspace.create({ data: { name: `${name} ws`, slug: `${name}-${tag}`, memberships: { create: { userId, role: "OWNER" } } } });
  created.users.push(userId);
  created.workspaces.push(ws.id);
  const market = await prisma.market.create({ data: { workspaceId: ws.id, name: `${name} market`, slug: "m", dataKind: "LIVE" } });
  const aspect = await prisma.aspectCategory.create({ data: { marketId: market.id, key: "pricing", label: "Pricing", description: "prices", seedKeywords: ["price"] } });
  const competitor = await prisma.competitor.create({ data: { marketId: market.id, name: `${name} Co`, slug: `secret-${name}` } });
  const ds = await prisma.dataSource.create({ data: { competitorId: competitor.id, kind: "CSV", label: "CSV" } });
  const when = new Date("2026-09-15T10:00:00Z");
  const review = await prisma.review.create({
    data: { marketId: market.id, competitorId: competitor.id, dataSourceId: ds.id, externalKey: "k1", text: `${name} private review about price`, rating: 1, reviewedAt: when, status: "ANALYSED" },
  });
  const run = await prisma.analysisRun.create({ data: { marketId: market.id, status: "SUCCEEDED", provider: "csv", finishedAt: new Date() } });
  await prisma.aspectMention.create({
    data: { reviewId: review.id, analysisRunId: run.id, aspectCategoryId: aspect.id, marketId: market.id, competitorId: competitor.id, reviewedAt: when, sentiment: "NEGATIVE", confidence: 0.9, layer: "LEXICON" },
  });
  const insight = await prisma.insight.create({
    data: {
      analysisRunId: run.id, marketId: market.id, competitorId: competitor.id, type: "OBSERVATION", kind: "WEAKNESS", title: `${name} secret`, statement: "x", facts: {},
      sampleSize: 1, dateFrom: when, dateTo: when, sources: [], confidence: "LOW", impact: "LOW", evidence: { create: { reviewId: review.id } },
    },
  });
  const report = await prisma.report.create({ data: { workspaceId: ws.id, marketId: market.id, title: `${name} report`, status: "READY", config: {}, createdById: userId } });
  const ctx = {
    user: { id: userId, name, email: `${name}@test.local` },
    workspace: { id: ws.id, name: ws.name, slug: ws.slug, isDemo: false, role: "OWNER" as const },
    workspaces: [],
    market: { id: market.id, name: market.name, slug: market.slug, dataKind: "LIVE" as const },
    markets: [],
    readOnly: false,
    readOnlyReason: null,
  };
  return { ctx, competitorSlug: competitor.slug, insightId: insight.id, reportId: report.id, reviewId: review.id };
}

let A: Fixture;
let B: Fixture;

beforeAll(async () => {
  A = await makeTenant("alpha");
  B = await makeTenant("beta");
});

afterAll(async () => {
  await prisma.workspace.deleteMany({ where: { id: { in: created.workspaces } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
});

const notFound = (p: Promise<unknown>) => expect(p).rejects.toSatisfy((e) => e instanceof AppError && e.code === "NOT_FOUND");

describe("workspace isolation", () => {
  it("sanity: each tenant sees its own data", async () => {
    expect((await listReviews(A.ctx, {})).items.map((r) => r.id)).toEqual([A.reviewId]);
    expect((await listInsights(A.ctx)).map((i) => i.id)).toEqual([A.insightId]);
    expect((await listReports(A.ctx)).map((r) => r.id)).toEqual([A.reportId]);
  });

  it("cannot read another workspace's competitor by slug", async () => {
    await notFound(getCompetitorBySlug(A.ctx, B.competitorSlug));
  });

  it("cannot read another workspace's report by direct ID", async () => {
    await notFound(getReport(A.ctx, B.reportId));
  });

  it("cannot read another workspace's insight evidence by direct ID", async () => {
    expect(await getInsightEvidence(A.ctx, B.insightId)).toEqual([]);
  });

  it("a forged context pointing at B's market returns nothing", async () => {
    const forged = { ...A.ctx, market: B.ctx.market }; // A's workspace, B's market id
    expect((await listReviews(forged, {})).items).toEqual([]);
    expect((await listReviews(forged, { insight: B.insightId })).total).toBe(0);
    expect(await listInsights(forged)).toEqual([]);
    expect(await getCompetitors(forged)).toEqual([]);
    expect(await listCompetitorsDetailed(forged)).toEqual([]);
    expect((await getAspectMatrix(forged, new Date(0), new Date("2100-01-01"))).size).toBe(0);
    const w = resolveWindow("all", new Date("2026-10-01"), new Date("2020-01-01"));
    expect(await getHealthTable(forged, w)).toEqual([]);
    await notFound(getCompetitorBySlug(forged, B.competitorSlug));
  });

  it("cannot modify another workspace's data (scoped updates touch zero rows)", async () => {
    const res = await prisma.competitor.updateMany({
      where: { slug: B.competitorSlug, marketId: B.ctx.market.id, market: { workspaceId: A.ctx.workspace.id } },
      data: { name: "hacked" },
    });
    expect(res.count).toBe(0);
    expect((await prisma.competitor.findFirst({ where: { slug: B.competitorSlug } }))?.name).toBe("beta Co");
  });

  it("the demo workspace is read-only", () => {
    expect(() => assertCanWrite({ ...A.ctx, readOnly: true, readOnlyReason: "demo" })).toThrow(AppError);
    expect(() => assertCanWrite(A.ctx)).not.toThrow();
  });
});

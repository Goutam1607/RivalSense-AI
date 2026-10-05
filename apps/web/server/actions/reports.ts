"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseRange } from "@/lib/date-range";
import { REPORT_SECTIONS, type SectionKey } from "@/lib/report-types";
import { getMarketContext, type AppContext } from "@/server/context";
import { getCompetitors } from "@/server/data/analytics";
import { getWindow } from "@/server/data/meta";
import { prisma } from "@/server/db/client";
import { Prisma } from "@/server/db/generated/client";
import { AppError, toActionError, type ActionResult } from "@/server/errors";
import { buildReportSnapshot } from "@/server/reports/build";

/**
 * Reports only read market data, so they are allowed in the read-only demo workspace too — there they
 * are private to their creator. Generation is rate-limited because it runs several aggregate queries.
 */
const REPORTS_PER_HOUR = 10;
async function assertCanCreateReport(ctx: AppContext) {
  const recent = await prisma.report.count({ where: { createdById: ctx.user.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= REPORTS_PER_HOUR) throw new AppError("RATE_LIMITED", `You can generate up to ${REPORTS_PER_HOUR} reports per hour. Please try again later.`);
}

/** Share links: owners of non-demo workspaces manage any report; in the demo workspace only your own. */
function reportOwnerFilter(ctx: AppContext) {
  return ctx.workspace.isDemo ? { workspaceId: ctx.workspace.id, createdById: ctx.user.id } : { workspaceId: ctx.workspace.id };
}

const sectionKeys = REPORT_SECTIONS.map((s) => s.key) as [SectionKey, ...SectionKey[]];

const createSchema = z.object({
  title: z.string().trim().min(3, "Give the report a title (3+ characters).").max(120),
  competitorIds: z.array(z.string().uuid()).min(1, "Choose at least one competitor.").max(12),
  range: z.string().max(10),
  sections: z.array(z.enum(sectionKeys)).min(1, "Choose at least one section."),
});

export async function createReport(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getMarketContext();
    await assertCanCreateReport(ctx);
    const parsed = createSchema.safeParse({
      title: formData.get("title"),
      competitorIds: formData.getAll("competitorIds"),
      range: formData.get("range") ?? "6m",
      sections: formData.getAll("sections"),
    });
    if (!parsed.success) {
      const out: Record<string, string[]> = {};
      for (const i of parsed.error.issues) (out[String(i.path[0])] ??= []).push(i.message);
      throw new AppError("VALIDATION", "Please fix the highlighted fields.", out);
    }
    const valid = new Set((await getCompetitors(ctx)).map((c) => c.id));
    const competitorIds = parsed.data.competitorIds.filter((id) => valid.has(id));
    if (competitorIds.length === 0) throw new AppError("VALIDATION", "Choose competitors from this market.", { competitorIds: ["Choose at least one competitor."] });
    const w = await getWindow(ctx, parseRange(parsed.data.range));
    if (!w) throw new AppError("VALIDATION", "This market has no analysed reviews yet.");
    const sections = REPORT_SECTIONS.map((s) => s.key).filter((k) => parsed.data.sections.includes(k));

    const report = await prisma.report.create({
      data: {
        workspaceId: ctx.workspace.id,
        marketId: ctx.market.id,
        createdById: ctx.user.id,
        title: parsed.data.title,
        status: "GENERATING",
        config: { competitorIds, range: w.key, sections },
      },
    });
    try {
      const snapshot = await buildReportSnapshot(ctx, { title: parsed.data.title, competitorIds, window: w, sections });
      await prisma.report.update({
        where: { id: report.id },
        data: { status: "READY", snapshot: snapshot as unknown as Prisma.InputJsonValue, analysisRunId: snapshot.analysisRunId, generatedAt: new Date() },
      });
    } catch (e) {
      console.error(e);
      await prisma.report.update({ where: { id: report.id }, data: { status: "FAILED", error: "Report generation failed." } });
      throw new AppError("VALIDATION", "Report generation failed. Please try again.");
    }
    revalidatePath("/reports");
    return { ok: true, data: { id: report.id } };
  } catch (e) {
    return toActionError(e);
  }
}

const shareSchema = z.object({ reportId: z.string().uuid(), expiresInDays: z.coerce.number().int().min(0).max(365) });

export async function createShareLink(reportId: string, expiresInDays: number): Promise<ActionResult<{ token: string }>> {
  try {
    const ctx = await getMarketContext();
    const p = shareSchema.parse({ reportId, expiresInDays });
    const report = await prisma.report.findFirst({ where: { id: p.reportId, ...reportOwnerFilter(ctx), status: "READY" } });
    if (!report) throw new AppError("NOT_FOUND", "Report not found.");
    const token = randomBytes(32).toString("base64url");
    await prisma.shareLink.create({
      data: { reportId: report.id, token, createdById: ctx.user.id, expiresAt: p.expiresInDays ? new Date(Date.now() + p.expiresInDays * 86_400_000) : null },
    });
    revalidatePath(`/reports/${report.id}`);
    return { ok: true, data: { token } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeShareLink(linkId: string): Promise<ActionResult> {
  try {
    const ctx = await getMarketContext();
    const id = z.string().uuid().parse(linkId);
    const { count } = await prisma.shareLink.updateMany({
      where: { id, revokedAt: null, report: reportOwnerFilter(ctx) },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new AppError("NOT_FOUND", "Share link not found.");
    revalidatePath("/reports");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

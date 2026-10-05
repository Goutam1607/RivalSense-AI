import "server-only";
import { z } from "zod";
import type { ReportSnapshot } from "@/lib/report-types";
import type { AppContext } from "@/server/context";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";

/** Reports are workspace-scoped; in the shared demo workspace each user sees only their own. */
function visible(ctx: AppContext) {
  return ctx.workspace.isDemo ? { workspaceId: ctx.workspace.id, createdById: ctx.user.id } : { workspaceId: ctx.workspace.id };
}

export async function listReports(ctx: AppContext) {
  return prisma.report.findMany({
    where: visible(ctx),
    include: { market: { select: { name: true } }, createdBy: { select: { name: true } }, _count: { select: { shareLinks: { where: { revokedAt: null } } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getReport(ctx: AppContext, id: string) {
  const rid = z.string().uuid().safeParse(id);
  if (!rid.success) throw new AppError("NOT_FOUND", "Report not found.");
  const r = await prisma.report.findFirst({
    where: { id: rid.data, ...visible(ctx) },
    include: { shareLinks: { orderBy: { createdAt: "desc" } } },
  });
  if (!r) throw new AppError("NOT_FOUND", "Report not found.");
  return { ...r, snapshot: r.snapshot as unknown as ReportSnapshot | null };
}

/** Public, read-only access through a share token. Returns null when missing, revoked or expired. */
export async function getSharedReport(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const link = await prisma.shareLink.findUnique({ where: { token }, include: { report: true } });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date()) || link.report.status !== "READY") return null;
  await prisma.shareLink.update({ where: { id: link.id }, data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() } });
  return { title: link.report.title, snapshot: link.report.snapshot as unknown as ReportSnapshot, expiresAt: link.expiresAt };
}

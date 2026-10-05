"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { slugify } from "@/lib/utils";
import { assertCanWrite, getMarketContext } from "@/server/context";
import { prisma } from "@/server/db/client";
import { AppError, toActionError, type ActionResult } from "@/server/errors";
import { parseCsv } from "@/server/csv";

const PLAY_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_CSV_ROWS = 20_000;

const competitorSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60, "Name must be at most 60 characters."),
  description: z.string().trim().max(300, "Keep the description under 300 characters.").optional().or(z.literal("").transform(() => undefined)),
  sourceKind: z.enum(["NONE", "GOOGLE_PLAY", "CSV"]),
  playId: z.string().trim().optional(),
});

function fieldErrors(e: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const i of e.issues) (out[String(i.path[0])] ??= []).push(i.message);
  return out;
}

/** Add a competitor with an optional data source (Play Store package id or CSV upload). */
export async function addCompetitor(formData: FormData): Promise<ActionResult<{ slug: string; imported: number }>> {
  try {
    const ctx = await getMarketContext();
    assertCanWrite(ctx);
    const parsed = competitorSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      sourceKind: formData.get("sourceKind"),
      playId: formData.get("playId") ?? undefined,
    });
    if (!parsed.success) throw new AppError("VALIDATION", "Please fix the highlighted fields.", fieldErrors(parsed.error));
    const { name, description, sourceKind, playId } = parsed.data;
    if (sourceKind === "GOOGLE_PLAY" && (!playId || !PLAY_ID.test(playId))) {
      throw new AppError("VALIDATION", "Please fix the highlighted fields.", { playId: ["Enter a package ID like com.example.app (from the Play Store URL ?id=…)."] });
    }
    let rows: { text: string; rating: number; reviewedAt: Date; appVersion: string | null; key: string }[] = [];
    const file = formData.get("csv");
    if (sourceKind === "CSV") {
      if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Please fix the highlighted fields.", { csv: ["Choose a CSV file."] });
      if (file.size > MAX_CSV_BYTES) throw new AppError("VALIDATION", "Please fix the highlighted fields.", { csv: ["The file is larger than 5 MB."] });
      const { rows: parsedRows, error } = parseCsv(await file.text(), MAX_CSV_ROWS);
      if (error) throw new AppError("VALIDATION", "Please fix the highlighted fields.", { csv: [error] });
      rows = parsedRows.map((r) => ({ ...r, key: createHash("sha256").update(`${file.name}|${r.raw}`).digest("hex").slice(0, 32) }));
    }

    const slug = slugify(name);
    const exists = await prisma.competitor.findFirst({ where: { marketId: ctx.market.id, slug } });
    if (exists) throw new AppError("VALIDATION", "Please fix the highlighted fields.", { name: ["A competitor with this name already exists in this market."] });
    const count = await prisma.competitor.count({ where: { marketId: ctx.market.id } });

    const result = await prisma.$transaction(async (tx) => {
      const c = await tx.competitor.create({ data: { marketId: ctx.market.id, name, slug, description, colorIndex: count } });
      if (sourceKind === "GOOGLE_PLAY") {
        await tx.dataSource.create({ data: { competitorId: c.id, kind: "GOOGLE_PLAY", label: "Google Play (public reviews)", externalId: playId } });
      }
      let imported = 0;
      if (sourceKind === "CSV") {
        const ds = await tx.dataSource.create({ data: { competitorId: c.id, kind: "CSV", label: `CSV import (${(file as File).name.slice(0, 60)})`, lastCollectedAt: new Date() } });
        const r = await tx.review.createMany({
          data: rows.map((x) => ({
            marketId: ctx.market.id,
            competitorId: c.id,
            dataSourceId: ds.id,
            externalKey: x.key,
            text: x.text,
            rating: x.rating,
            reviewedAt: x.reviewedAt,
            appVersion: x.appVersion,
          })),
          skipDuplicates: true,
        });
        imported = r.count;
      }
      return { slug: c.slug, imported };
    });
    revalidatePath("/competitors");
    revalidatePath("/dashboard");
    return { ok: true, data: result };
  } catch (e) {
    return toActionError(e);
  }
}

const editSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
});

export async function updateCompetitor(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await getMarketContext();
    assertCanWrite(ctx);
    const parsed = editSchema.safeParse({ id: formData.get("id"), name: formData.get("name"), description: formData.get("description") ?? undefined });
    if (!parsed.success) throw new AppError("VALIDATION", "Please fix the highlighted fields.", fieldErrors(parsed.error));
    const { count } = await prisma.competitor.updateMany({
      where: { id: parsed.data.id, marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } },
      data: { name: parsed.data.name, description: parsed.data.description || null },
    });
    if (count === 0) throw new AppError("NOT_FOUND", "Competitor not found.");
    revalidatePath("/competitors");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCompetitorArchived(id: string, archived: boolean): Promise<ActionResult> {
  try {
    const ctx = await getMarketContext();
    assertCanWrite(ctx);
    const cid = z.string().uuid().parse(id);
    const { count } = await prisma.competitor.updateMany({
      where: { id: cid, marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } },
      data: { status: archived ? "ARCHIVED" : "ACTIVE" },
    });
    if (count === 0) throw new AppError("NOT_FOUND", "Competitor not found.");
    revalidatePath("/competitors");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

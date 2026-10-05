import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { Prisma } from "@/server/db/generated/client";
import { marketScope, type Ctx } from "./analytics";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SENT = z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]);

/** Review explorer filters. Every value comes from the URL, so each one is validated and bounded. */
export const reviewFilterSchema = z.object({
  competitor: z.string().max(80).optional().catch(undefined),
  sentiment: SENT.optional().catch(undefined),
  aspect: z.string().max(80).optional().catch(undefined),
  aspectSentiment: SENT.optional().catch(undefined),
  rating: z
    .string()
    .regex(/^[1-5](,[1-5])*$/)
    .optional()
    .catch(undefined),
  from: dateStr.optional().catch(undefined),
  to: dateStr.optional().catch(undefined),
  source: z.enum(["DEMO", "CSV", "GOOGLE_PLAY"]).optional().catch(undefined),
  language: z.string().max(20).optional().catch(undefined),
  status: z.enum(["analysed", "not_analysed", "hidden", "all"]).optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
  insight: z.string().uuid().optional().catch(undefined),
  topic: z.string().uuid().optional().catch(undefined),
  minVersion: z
    .string()
    .regex(/^\d+(\.\d+){0,3}$/)
    .optional()
    .catch(undefined),
  version: z.string().max(40).optional().catch(undefined),
  cursor: z.string().max(200).optional().catch(undefined),
});
export type ReviewFilters = z.infer<typeof reviewFilterSchema>;

export function parseReviewFilters(sp: Record<string, string | string[] | undefined>): ReviewFilters {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== undefined && v !== ""));
  return reviewFilterSchema.parse(flat);
}

export function encodeCursor(reviewedAt: Date, id: string) {
  return Buffer.from(`${reviewedAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(c: string | undefined): { at: Date; id: string } | null {
  if (!c) return null;
  try {
    const [at, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    const d = new Date(at);
    if (Number.isNaN(d.getTime()) || !z.string().uuid().safeParse(id).success) return null;
    return { at: d, id };
  } catch {
    return null;
  }
}

/** WHERE clause shared by the list, the count and the CSV export. */
export function buildWhere(ctx: Ctx, f: ReviewFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [marketScope(ctx, "r")];
  const status = f.status ?? (f.insight || f.topic ? "all" : "analysed_or_language");
  if (status === "analysed") parts.push(Prisma.sql`r.status = 'ANALYSED'`);
  else if (status === "not_analysed") parts.push(Prisma.sql`r.status = 'NOT_ANALYSED_LANGUAGE'`);
  else if (status === "hidden") parts.push(Prisma.sql`r.status IN ('DUPLICATE', 'SPAM')`);
  else if (status === "analysed_or_language") parts.push(Prisma.sql`r.status NOT IN ('DUPLICATE', 'SPAM')`);
  if (f.competitor) parts.push(Prisma.sql`c.slug = ${f.competitor}`);
  if (f.sentiment) parts.push(Prisma.sql`rs.label = ${f.sentiment}::"Sentiment"`);
  if (f.aspect) {
    parts.push(
      f.aspectSentiment
        ? Prisma.sql`EXISTS (SELECT 1 FROM aspect_mention am JOIN aspect_category ac ON ac.id = am.aspect_category_id
                     WHERE am.review_id = r.id AND ac.key = ${f.aspect} AND am.sentiment = ${f.aspectSentiment}::"Sentiment")`
        : Prisma.sql`EXISTS (SELECT 1 FROM aspect_mention am JOIN aspect_category ac ON ac.id = am.aspect_category_id
                     WHERE am.review_id = r.id AND ac.key = ${f.aspect})`,
    );
  } else if (f.aspectSentiment) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM aspect_mention am WHERE am.review_id = r.id AND am.sentiment = ${f.aspectSentiment}::"Sentiment")`);
  }
  if (f.rating) parts.push(Prisma.sql`r.rating = ANY(${f.rating.split(",").map(Number)}::int[])`);
  if (f.from) parts.push(Prisma.sql`r.reviewed_at >= ${new Date(`${f.from}T00:00:00Z`)}`);
  if (f.to) parts.push(Prisma.sql`r.reviewed_at < ${new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000)}`);
  if (f.source) parts.push(Prisma.sql`ds.kind = ${f.source}::"DataSourceKind"`);
  if (f.language) parts.push(Prisma.sql`r.language = ${f.language}`);
  if (f.q) parts.push(Prisma.sql`to_tsvector('english', r.text) @@ websearch_to_tsquery('english', ${f.q})`);
  if (f.insight)
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM insight_evidence ie JOIN insight i ON i.id = ie.insight_id
                 WHERE ie.review_id = r.id AND ie.insight_id = ${f.insight}::uuid AND i.market_id = ${ctx.market.id}::uuid)`);
  if (f.topic)
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM topic_assignment ta JOIN topic t ON t.id = ta.topic_id
                 WHERE ta.review_id = r.id AND ta.topic_id = ${f.topic}::uuid AND t.market_id = ${ctx.market.id}::uuid)`);
  if (f.version) parts.push(Prisma.sql`r.app_version = ${f.version}`);
  if (f.minVersion)
    parts.push(Prisma.sql`r.app_version ~ '^[0-9]+(\\.[0-9]+)*$' AND string_to_array(r.app_version, '.')::int[] >= string_to_array(${f.minVersion}, '.')::int[]`);
  return Prisma.join(parts, " AND ");
}

const FROM = Prisma.sql`
  FROM review r
  JOIN competitor c ON c.id = r.competitor_id
  JOIN data_source ds ON ds.id = r.data_source_id
  LEFT JOIN review_sentiment rs ON rs.review_id = r.id`;

type RawRow = {
  id: string;
  text: string;
  clean_text: string | null;
  rating: number;
  reviewed_at: Date;
  app_version: string | null;
  language: string | null;
  status: string;
  competitor: string;
  competitor_slug: string;
  color_index: number;
  source_kind: string;
  source_label: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | null;
  sentiment_conf: number | null;
};

export type ReviewMention = {
  aspectKey: string;
  aspectLabel: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  confidence: number;
  layer: "LEXICON" | "EMBEDDING" | "BOTH";
  matchStart: number | null;
  matchEnd: number | null;
  matchedText: string | null;
  similarity: number | null;
  clauseId: string | null;
};
export type ReviewClauseRow = { id: string; position: number; text: string; charStart: number; charEnd: number; sentiment: string | null; confidence: number | null };
export type ReviewListItem = Omit<RawRow, "clean_text" | "text"> & { text: string; mentions: ReviewMention[]; clauses: ReviewClauseRow[] };

export const PAGE_SIZE = 25;

export async function listReviews(ctx: Ctx, f: ReviewFilters) {
  const where = buildWhere(ctx, f);
  const cursor = decodeCursor(f.cursor);
  const cursorSql = cursor ? Prisma.sql`AND (r.reviewed_at, r.id) < (${cursor.at}, ${cursor.id}::uuid)` : Prisma.empty;
  const [rows, countRow] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      SELECT r.id::text, r.text, r.clean_text, r.rating, r.reviewed_at, r.app_version, r.language, r.status::text,
             c.name AS competitor, c.slug AS competitor_slug, c.color_index, ds.kind::text AS source_kind, ds.label AS source_label,
             rs.label::text AS sentiment, rs.confidence AS sentiment_conf
      ${FROM}
      WHERE ${where} ${cursorSql}
      ORDER BY r.reviewed_at DESC, r.id DESC
      LIMIT ${PAGE_SIZE + 1}`,
    prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n ${FROM} WHERE ${where}`,
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const ids = page.map((r) => r.id);
  const [mentions, clauses] = ids.length
    ? await Promise.all([
        prisma.aspectMention.findMany({
          where: { reviewId: { in: ids }, marketId: ctx.market.id },
          include: { aspectCategory: { select: { key: true, label: true } } },
        }),
        prisma.reviewClause.findMany({ where: { reviewId: { in: ids } }, orderBy: { position: "asc" } }),
      ])
    : [[], []];
  const items: ReviewListItem[] = page.map(({ clean_text, text, ...r }) => ({
    ...r,
    // Offsets for highlighting refer to the cleaned text, so show it when the pipeline produced one.
    text: clean_text ?? text,
    mentions: mentions
      .filter((m) => m.reviewId === r.id)
      .map((m) => ({
        aspectKey: m.aspectCategory.key,
        aspectLabel: m.aspectCategory.label,
        sentiment: m.sentiment,
        confidence: m.confidence,
        layer: m.layer,
        matchStart: m.matchStart,
        matchEnd: m.matchEnd,
        matchedText: m.matchedText,
        similarity: m.similarity,
        clauseId: m.clauseId,
      })),
    clauses: clauses
      .filter((c) => c.reviewId === r.id)
      .map((c) => ({ id: c.id, position: c.position, text: c.text, charStart: c.charStart, charEnd: c.charEnd, sentiment: c.sentiment, confidence: c.confidence })),
  }));
  const last = page[page.length - 1];
  return { items, total: countRow[0]?.n ?? 0, nextCursor: hasMore && last ? encodeCursor(last.reviewed_at, last.id) : null };
}

export const EXPORT_CAP = 10_000;

/** Streams the filtered set as CSV rows (capped, workspace-scoped). */
export async function* exportReviewRows(ctx: Ctx, f: ReviewFilters): AsyncGenerator<RawRow & { aspects: string }> {
  const where = buildWhere(ctx, { ...f, cursor: undefined });
  let cursor: { at: Date; id: string } | null = null;
  let sent = 0;
  while (sent < EXPORT_CAP) {
    const cursorSql: Prisma.Sql = cursor ? Prisma.sql`AND (r.reviewed_at, r.id) < (${cursor.at}, ${cursor.id}::uuid)` : Prisma.empty;
    const rows: (RawRow & { aspects: string })[] = await prisma.$queryRaw`
      SELECT r.id::text, r.text, r.clean_text, r.rating, r.reviewed_at, r.app_version, r.language, r.status::text,
             c.name AS competitor, c.slug AS competitor_slug, c.color_index, ds.kind::text AS source_kind, ds.label AS source_label,
             rs.label::text AS sentiment, rs.confidence AS sentiment_conf,
             COALESCE((SELECT string_agg(ac.key || ':' || lower(am.sentiment::text), '; ' ORDER BY ac.sort_order)
                       FROM aspect_mention am JOIN aspect_category ac ON ac.id = am.aspect_category_id WHERE am.review_id = r.id), '') AS aspects
      ${FROM}
      WHERE ${where} ${cursorSql}
      ORDER BY r.reviewed_at DESC, r.id DESC
      LIMIT ${Math.min(1000, EXPORT_CAP - sent)}`;
    if (rows.length === 0) break;
    for (const r of rows) yield r;
    sent += rows.length;
    const last = rows[rows.length - 1];
    cursor = { at: last.reviewed_at, id: last.id };
  }
}

/** Distinct languages present in the market (for the filter). */
export async function getLanguages(ctx: Ctx) {
  const rows = await prisma.$queryRaw<{ language: string; n: number }[]>`
    SELECT r.language, COUNT(*)::int AS n FROM review r WHERE ${marketScope(ctx, "r")} AND r.language IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`;
  return rows;
}

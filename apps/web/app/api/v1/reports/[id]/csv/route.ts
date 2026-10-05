import { DEMO_LABEL } from "@/lib/constants";
import { apiError, csvCell } from "@/server/api";
import { getContext } from "@/server/context";
import { getReport } from "@/server/data/reports";
import { AppError } from "@/server/errors";

/** GET /api/v1/reports/:id/csv — the aspect aggregates behind a report. */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/reports/[id]/csv">) {
  try {
    const { id } = await ctx.params;
    const report = await getReport(await getContext(), id);
    const s = report.snapshot;
    if (!s) throw new AppError("NOT_FOUND", "Report is not ready.");
    const lines: string[] = [];
    if (s.market.dataKind === "DEMO_SYNTHETIC") lines.push(`# ${DEMO_LABEL}`);
    lines.push(`# ${s.title} · ${s.market.name} · ${s.window.from.slice(0, 10)} to ${s.window.to.slice(0, 10)} · analysis run ${s.analysisRunId ?? "-"}`);
    lines.push(["competitor", "aspect", "mentions", "positive", "neutral", "negative", "score", "score_interval_low", "score_interval_high", "confidence"].join(","));
    for (const x of s.scores) {
      const name = s.competitors.find((c) => c.id === x.competitorId)?.name;
      const aspect = s.aspects.find((a) => a.key === x.aspectKey)?.label;
      lines.push([name, aspect, x.n, x.pos, x.neu, x.neg, x.score?.toFixed(1) ?? "", x.low.toFixed(1), x.high.toFixed(1), x.confidence ?? "not enough data"].map(csvCell).join(","));
    }
    return new Response(lines.join("\n") + "\n", {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="report-${report.id.slice(0, 8)}-aggregates.csv"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}

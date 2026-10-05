import { apiError } from "@/server/api";
import { getContext } from "@/server/context";
import { getReport, getSharedReport } from "@/server/data/reports";
import { AppError } from "@/server/errors";
import { renderReportPdf } from "@/server/reports/pdf";

export const runtime = "nodejs";

/** GET /api/v1/reports/:id/pdf — signed-in workspace members, or anyone with a valid ?token= share token. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/reports/[id]/pdf">) {
  try {
    const { id } = await ctx.params;
    const token = new URL(request.url).searchParams.get("token");
    let snapshot;
    let title;
    if (token) {
      const shared = await getSharedReport(token);
      if (!shared) throw new AppError("NOT_FOUND", "This share link is invalid, expired or revoked.");
      snapshot = shared.snapshot;
      title = shared.title;
    } else {
      const report = await getReport(await getContext(), id);
      if (!report.snapshot || report.status !== "READY") throw new AppError("NOT_FOUND", "Report is not ready.");
      snapshot = report.snapshot;
      title = report.title;
    }
    const pdf = await renderReportPdf(snapshot);
    const filename = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "report";
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}

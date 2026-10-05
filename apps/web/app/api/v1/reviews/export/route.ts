import { csvCell, searchParamsObject, withMarket } from "@/server/api";
import { DEMO_LABEL } from "@/lib/constants";
import { EXPORT_CAP, exportReviewRows, parseReviewFilters } from "@/server/data/reviews";

/** GET /api/v1/reviews/export — the current filtered review set as CSV (streamed, capped, workspace-scoped). */
export async function GET(request: Request) {
  return withMarket(async (ctx) => {
    const filters = parseReviewFilters(searchParamsObject(request.url));
    const encoder = new TextEncoder();
    const header = ["reviewed_at", "competitor", "rating", "source", "app_version", "language", "status", "overall_sentiment", "aspects", "text"];
    const stream = new ReadableStream({
      async start(controller) {
        if (ctx.market.dataKind === "DEMO_SYNTHETIC") controller.enqueue(encoder.encode(`# ${DEMO_LABEL}\n`));
        controller.enqueue(encoder.encode(`${header.join(",")}\n`));
        try {
          for await (const r of exportReviewRows(ctx, filters)) {
            const row = [r.reviewed_at, r.competitor, r.rating, r.source_label, r.app_version, r.language, r.status, r.sentiment, r.aspects, r.clean_text ?? r.text];
            controller.enqueue(encoder.encode(`${row.map(csvCell).join(",")}\n`));
          }
        } catch (e) {
          console.error(e);
          controller.enqueue(encoder.encode(`# export interrupted\n`));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rivalsense-reviews-${ctx.market.slug}.csv"`,
        "Cache-Control": "no-store",
        "X-Export-Cap": String(EXPORT_CAP),
      },
    });
  });
}

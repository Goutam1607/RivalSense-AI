import { Download, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ErrorNotice } from "@/components/ui/states";
import { ShareLinks } from "@/features/reports/report-forms";
import { ReportView } from "@/features/reports/report-view";
import { fmtDateTime } from "@/lib/format";
import { getContext } from "@/server/context";
import { getReport } from "@/server/data/reports";
import { AppError } from "@/server/errors";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ params }: PageProps<"/reports/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  let report;
  try {
    report = await getReport(ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <>
      <PageHeader
        title={report.title}
        meta={
          <>
            <Badge tone={report.status === "READY" ? "positive" : report.status === "FAILED" ? "negative" : "warning"} casing="normal">
              {report.status === "READY" ? "Ready" : report.status === "FAILED" ? "Failed" : "Generating"}
            </Badge>
            <span>Generated {report.generatedAt ? fmtDateTime(report.generatedAt) : "—"}</span>
          </>
        }
        actions={
          report.status === "READY" && (
            <>
              <Button variant="secondary" asChild>
                <a href={`/api/v1/reports/${report.id}/csv`} download>
                  <FileSpreadsheet aria-hidden /> CSV (aggregates)
                </a>
              </Button>
              <Button variant="primary" asChild>
                <a href={`/api/v1/reports/${report.id}/pdf`} download>
                  <Download aria-hidden /> Download PDF
                </a>
              </Button>
            </>
          )
        }
      />
      {report.status === "READY" && report.snapshot ? (
        <div className="grid gap-5">
          <Panel title="Share" description="Anyone with the link can view this report without signing in. Revoke a link to stop access immediately.">
            <ShareLinks reportId={report.id} links={report.shareLinks} readOnlyReason={null} origin={origin} />
          </Panel>
          <ReportView s={report.snapshot} />
        </div>
      ) : (
        <ErrorNotice
          title={report.status === "FAILED" ? "Report generation failed" : "Report is still generating"}
          description={report.error ?? "Refresh in a moment."}
        />
      )}
    </>
  );
}

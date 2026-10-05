import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDateTime } from "@/lib/format";
import { getContext } from "@/server/context";
import { listReports } from "@/server/data/reports";

export const metadata: Metadata = { title: "Reports" };

const STATUS = { READY: "positive", GENERATING: "warning", FAILED: "negative" } as const;

export default async function ReportsPage() {
  const ctx = await getContext();
  const reports = await listReports(ctx);
  const action = (
    <Button variant="primary" asChild>
      <Link href="/reports/new">
        <Plus aria-hidden /> New report
      </Link>
    </Button>
  );
  return (
    <>
      <PageHeader
        title="Reports"
        description="Consulting-style reports frozen at generation time, with PDF and CSV export and revocable share links."
        actions={action}
      />
      <Panel bodyClassName="p-0">
        {reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No reports yet"
            description={
              ctx.readOnly
                ? "Generate a report from the demo market. In the demo workspace your reports are private to you."
                : "Generate a report for a market, a set of competitors and a date range."
            }
            action={action}
          />
        ) : (
          <Table>
            <caption className="sr-only">Saved reports</caption>
            <THead>
              <tr>
                <TH>Title</TH>
                <TH>Market</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH>Created by</TH>
                <TH numeric>Active share links</TH>
              </tr>
            </THead>
            <TBody>
              {reports.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/reports/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                  </TD>
                  <TD className="text-fg-muted">{r.market.name}</TD>
                  <TD>
                    <Badge tone={STATUS[r.status]} casing="normal">
                      {r.status === "READY" ? "Ready" : r.status === "GENERATING" ? "Generating" : "Failed"}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-fg-muted">{fmtDateTime(r.createdAt)}</TD>
                  <TD className="text-fg-muted">{r.createdBy?.name ?? "—"}</TD>
                  <TD numeric>{r._count.shareLinks}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </>
  );
}

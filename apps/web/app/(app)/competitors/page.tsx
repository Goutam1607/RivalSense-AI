import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { stickyCol, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DisabledButton } from "@/components/ui/tooltip";
import { CompetitorRowActions } from "@/features/competitors/competitor-forms";
import { competitorColor, SOURCE_LABEL } from "@/lib/constants";
import { fmtDate, fmtInt } from "@/lib/format";
import { getMarketContext } from "@/server/context";
import { listCompetitorsDetailed } from "@/server/data/competitors";
import { getMarketMeta } from "@/server/data/meta";

export const metadata: Metadata = { title: "Competitors" };

export default async function CompetitorsPage() {
  const ctx = await getMarketContext();
  const [rows, meta] = await Promise.all([listCompetitorsDetailed(ctx), getMarketMeta(ctx)]);
  const addButton = ctx.readOnlyReason ? (
    <DisabledButton reason={ctx.readOnlyReason} variant="primary">
      <Plus aria-hidden /> Add competitor
    </DisabledButton>
  ) : (
    <Button variant="primary" asChild>
      <Link href="/competitors/new">
        <Plus aria-hidden /> Add competitor
      </Link>
    </Button>
  );
  return (
    <>
      <PageHeader title="Competitors" description={`Competitors tracked in ${ctx.market.name}, their data sources and analysis status.`} actions={addButton} />
      <Panel bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No competitors tracked yet" description="Add a competitor and where its public reviews come from." action={addButton} />
        ) : (
          <Table>
            <caption className="sr-only">Competitors</caption>
            <THead>
              <tr>
                <TH>Competitor</TH>
                <TH>Data sources</TH>
                <TH>Status</TH>
                <TH numeric>Reviews</TH>
                <TH numeric>Analysed</TH>
                <TH>Latest review</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((c) => {
                const awaiting = c.status === "ACTIVE" && (c.pending > 0 || !meta.latestRun || c.analysed === 0);
                return (
                  <TR key={c.id} className={c.status === "ARCHIVED" ? "opacity-60" : undefined}>
                    <TD className={`${stickyCol} whitespace-nowrap`}>
                      <Link href={`/competitors/${c.slug}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                        <span className="size-2 rounded-full" style={{ background: competitorColor(c.colorIndex) }} aria-hidden />
                        {c.name}
                      </Link>
                      {c.description && <p className="max-w-xs truncate text-xs text-fg-subtle">{c.description}</p>}
                    </TD>
                    <TD>
                      {c.dataSources.length === 0 ? (
                        <span className="text-xs text-fg-subtle">None yet</span>
                      ) : (
                        <ul className="space-y-0.5 text-xs">
                          {c.dataSources.map((d) => (
                            <li key={d.id}>
                              {SOURCE_LABEL[d.kind] ?? d.kind}
                              {d.externalId && <span className="ml-1 font-mono text-fg-subtle">{d.externalId}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {c.status === "ARCHIVED" ? (
                        <Badge tone="outline" casing="normal">Archived</Badge>
                      ) : awaiting ? (
                        <Badge tone="warning" casing="normal">Awaiting first analysis run</Badge>
                      ) : (
                        <Badge tone="positive" casing="normal">Analysed</Badge>
                      )}
                    </TD>
                    <TD numeric>{fmtInt(c.total)}</TD>
                    <TD numeric>{fmtInt(c.analysed)}</TD>
                    <TD className="whitespace-nowrap text-fg-muted tabular">{c.lastReview ? fmtDate(c.lastReview) : "—"}</TD>
                    <TD>
                      <CompetitorRowActions id={c.id} name={c.name} description={c.description} archived={c.status === "ARCHIVED"} readOnlyReason={ctx.readOnlyReason} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>
    </>
  );
}

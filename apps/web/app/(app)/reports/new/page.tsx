import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { ReportBuilder } from "@/features/reports/report-forms";
import { DEFAULT_RANGE } from "@/lib/date-range";
import { getMarketContext } from "@/server/context";
import { getCompetitors } from "@/server/data/analytics";
import { getMarketMeta } from "@/server/data/meta";

export const metadata: Metadata = { title: "New report" };

export default async function NewReportPage() {
  const ctx = await getMarketContext();
  const [competitors, meta] = await Promise.all([getCompetitors(ctx), getMarketMeta(ctx)]);
  const range = (await cookies()).get("rs_range")?.value ?? DEFAULT_RANGE;
  return (
    <>
      <PageHeader title="New report" description="Choose what to include. Numbers come from the latest analysis run and are frozen into the report." />
      <Panel>
        {!meta.latestRun || competitors.length === 0 ? (
          <EmptyState title="Nothing to report yet" description="This market needs competitors and at least one analysis run." />
        ) : (
          <ReportBuilder marketName={ctx.market.name} competitors={competitors.map((c) => ({ id: c.id, name: c.name }))} defaultRange={range} />
        )}
      </Panel>
    </>
  );
}

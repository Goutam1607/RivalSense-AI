import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/panel";
import { AddCompetitorForm } from "@/features/competitors/competitor-forms";
import { getMarketContext } from "@/server/context";

export const metadata: Metadata = { title: "Add competitor" };

export default async function NewCompetitorPage() {
  const ctx = await getMarketContext();
  if (ctx.readOnly) redirect("/competitors");
  return (
    <>
      <PageHeader title="Add competitor" description={`Add a competitor to ${ctx.market.name}. Reviews are analysed by the pipeline, not in the browser.`} />
      <Panel>
        <AddCompetitorForm />
      </Panel>
    </>
  );
}

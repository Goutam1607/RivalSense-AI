import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConfidenceBadge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { UrlFilters } from "@/components/url-filters";
import { InsightCard } from "@/features/insights/insight-card";
import { INSIGHT_TYPE_LABEL, INSIGHT_TYPES } from "@/lib/constants";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn, qs } from "@/lib/utils";
import { getMarketContext } from "@/server/context";
import { getAspects, getCompetitors } from "@/server/data/analytics";
import { insightFilterSchema, listInsights } from "@/server/data/insights";
import { getMarketMeta, getWindow } from "@/server/data/meta";
import { buildSwot, type SwotItem } from "@/server/data/swot";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const sp = await searchParams;
  const ctx = await getMarketContext();
  const view = sp.view === "swot" ? "swot" : "feed";
  const [competitors, aspects, meta] = await Promise.all([getCompetitors(ctx), getAspects(ctx), getMarketMeta(ctx)]);

  const tabs = (
    <nav aria-label="Insight views" className="mb-5 border-b border-border">
      <ul className="flex gap-1">
        {[
          { k: "feed", l: "Insights feed" },
          { k: "swot", l: "SWOT by competitor" },
        ].map((t) => (
          <li key={t.k}>
            <Link
              href={`/insights${qs({ view: t.k === "feed" ? undefined : t.k, range: typeof sp.range === "string" ? sp.range : undefined })}`}
              aria-current={view === t.k ? "page" : undefined}
              className={cn("inline-block border-b-2 px-3 py-2 text-sm", view === t.k ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}
            >
              {t.l}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  const header = (
    <PageHeader
      title="Insights"
      description="Typed findings generated from the computed metrics. Only observations state numbers as facts; interpretations, opportunities and recommendations are analytical suggestions."
      meta={meta.latestRun ? <span>From analysis run {meta.latestRun.id.slice(0, 8)} · {fmtDate(meta.latestRun.finishedAt ?? meta.latestRun.startedAt)}</span> : undefined}
    />
  );

  if (view === "swot") {
    const w = await getWindow(ctx, sp.range);
    const slug = typeof sp.competitor === "string" ? sp.competitor : competitors[0]?.slug;
    const me = competitors.find((c) => c.slug === slug) ?? competitors[0];
    const swot = me && w ? await buildSwot(ctx, me.id, w) : null;
    return (
      <>
        {header}
        {tabs}
        <div className="mb-4">
          <Suspense>
            <UrlFilters fields={[{ key: "competitor", label: "Competitor", options: competitors.map((c) => ({ value: c.slug, label: c.name })), allLabel: competitors[0]?.name ?? "—" }]} keep={["view", "range"]} />
          </Suspense>
        </div>
        {!swot || !me ? (
          <Panel>
            <EmptyState title="No data for a SWOT yet" description="Run the analysis pipeline first." />
          </Panel>
        ) : (
          <>
            <p className="mb-3 text-sm text-fg-muted">
              SWOT for <strong className="text-fg">{me.name}</strong>, {w!.label.toLowerCase()} — built only from computed findings. Every item links to its evidence.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <SwotBox title="Strengths" hint="High-scoring aspects and market leads" items={swot.strengths} />
              <SwotBox title="Weaknesses" hint="Low-scoring aspects and market gaps" items={swot.weaknesses} />
              <SwotBox title="Opportunities" hint="Rivals' weaknesses and market-wide gaps" items={swot.opportunities} suggestion />
              <SwotBox title="Threats" hint="Rivals' strengths and emerging issues" items={swot.threats} suggestion />
            </div>
          </>
        )}
      </>
    );
  }

  const filters = insightFilterSchema.parse({
    type: sp.type,
    competitor: sp.competitor,
    aspect: sp.aspect,
    confidence: sp.confidence,
  });
  const insights = await listInsights(ctx, filters);
  return (
    <>
      {header}
      {tabs}
      <div className="mb-4">
        <Suspense>
          <UrlFilters
            fields={[
              { key: "type", label: "Type", options: INSIGHT_TYPES.map((t) => ({ value: t, label: INSIGHT_TYPE_LABEL[t] })) },
              { key: "competitor", label: "Competitor", options: competitors.map((c) => ({ value: c.slug, label: c.name })) },
              { key: "aspect", label: "Aspect", options: aspects.map((a) => ({ value: a.key, label: a.label })) },
              { key: "confidence", label: "Confidence", options: ["HIGH", "MEDIUM", "LOW"].map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() })) },
            ]}
          />
        </Suspense>
      </div>
      <p className="mb-3 text-sm text-fg-muted tabular" aria-live="polite">
        {fmtInt(insights.length)} insight{insights.length === 1 ? "" : "s"}
      </p>
      {insights.length === 0 ? (
        <Panel>
          <EmptyState title="No insights match these filters" description={meta.latestRun ? "Try removing a filter." : "Insights appear after the first analysis run."} />
        </Panel>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}
    </>
  );
}

function SwotBox({ title, hint, items, suggestion }: { title: string; hint: string; items: SwotItem[]; suggestion?: boolean }) {
  return (
    <Panel title={title} description={suggestion ? `${hint} · Analytical suggestion — not verified market fact` : hint}>
      {items.length === 0 ? (
        <p className="text-sm text-fg-subtle">Nothing qualifies with the current data and thresholds.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it, i) => (
            <li key={`${i}-${it.title}`} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{it.title}</p>
                <ConfidenceBadge value={it.confidence} />
              </div>
              <p className="mt-0.5 text-sm text-fg-muted">{it.detail}</p>
              <p className="mt-1 flex items-center justify-between text-xs text-fg-subtle">
                <span className="tabular">n = {fmtInt(it.n)} mentions</span>
                <Link href={it.evidenceHref} className="inline-flex items-center gap-1 text-accent hover:underline">
                  Evidence <ArrowRight className="size-3" aria-hidden />
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

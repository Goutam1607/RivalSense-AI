import { AlertTriangle, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TimeSeriesChart, type Point } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { SentimentSplit } from "@/components/ui/score-bar";
import { EmptyState } from "@/components/ui/states";
import { DisabledButton } from "@/components/ui/tooltip";
import { AwaitingRun } from "@/features/dashboard/awaiting-run";
import { HealthTable } from "@/features/dashboard/health-table";
import { InsightCard } from "@/features/insights/insight-card";
import { DEMO_LABEL } from "@/lib/constants";
import { fmtDate, fmtInt, fmtMonthShort, fmtP, fmtPct, fmtRelative, fmtShortDate } from "@/lib/format";
import { MIN_SAMPLE, sentimentIndex } from "@/lib/metrics";
import { qs } from "@/lib/utils";
import { getMarketContext } from "@/server/context";
import { getCompetitors, getDrivers, getEmergingIssues, getHealthTable, getSentimentSeries } from "@/server/data/analytics";
import { listInsights } from "@/server/data/insights";
import { getMarketMeta, getWindow } from "@/server/data/meta";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const ctx = await getMarketContext().catch(() => null);
  if (!ctx) return <NoMarket />;
  const [meta, competitors] = await Promise.all([getMarketMeta(ctx), getCompetitors(ctx)]);

  if (competitors.length === 0) {
    return (
      <>
        <PageHeader title={ctx.market.name} description="Competitive overview" />
        <Panel>
          <EmptyState
            title="No competitors tracked yet"
            description="Add the competitors you want to watch and where their public reviews come from. Analysis then runs in the pipeline."
            action={<AddCompetitorButton readOnlyReason={ctx.readOnlyReason} />}
          />
        </Panel>
      </>
    );
  }
  const w = await getWindow(ctx, sp.range);
  if (!meta.latestRun || !w) {
    return (
      <>
        <PageHeader title={ctx.market.name} description={`${competitors.length} competitors tracked`} />
        <AwaitingRun reviewCount={meta.reviewCount} />
      </>
    );
  }

  const [health, drivers, series, issues, opportunities] = await Promise.all([
    getHealthTable(ctx, w),
    getDrivers(ctx, w),
    getSentimentSeries(ctx, w),
    getEmergingIssues(ctx, meta.latestRun.id),
    listInsights(ctx, { type: "OPPORTUNITY" }, 5),
  ]);

  // Sentiment index per competitor per period; periods with fewer than MIN_SAMPLE reviews are left empty.
  const periods = [...new Set(series.rows.map((r) => r.period.toISOString()))].sort();
  const points: Point[] = periods.map((p) => {
    const row: Point = { x: p, xLabel: series.grain === "week" ? `Week of ${fmtShortDate(p)}` : fmtMonthShort(p) };
    for (const c of competitors) {
      const r = series.rows.find((x) => x.competitor_id === c.id && x.period.toISOString() === p);
      const n = r ? r.pos + r.neu + r.neg : 0;
      row[c.id] = r && n >= MIN_SAMPLE ? sentimentIndex(r.pos, r.neu, r.neg) : null;
      row[`${c.id}__n`] = n;
    }
    return row;
  });
  const totalReviews = health.reduce((s, r) => s + r.reviews, 0);
  const isDemo = ctx.market.dataKind === "DEMO_SYNTHETIC";

  return (
    <>
      <PageHeader
        title={ctx.market.name}
        description="Track how customer sentiment changes across competitors and see which categories drive dissatisfaction."
        meta={
          <>
            <span>{competitors.length} competitors</span>
            <span>
              {w.label}: {fmtDate(w.from)} – {fmtDate(meta.asOf!)}
            </span>
            <span className="tabular">{fmtInt(totalReviews)} reviews in range</span>
            <span>
              Data through {fmtDate(meta.asOf!)} · analysed {fmtRelative(meta.latestRun.finishedAt ?? meta.latestRun.startedAt)}
            </span>
            {isDemo && <Badge tone="warning">{DEMO_LABEL}</Badge>}
          </>
        }
      />

      <div className="grid gap-5">
        <Panel
          id="sentiment-trend"
          title="Market sentiment over time"
          description={`Sentiment index per competitor (0 = all negative, 50 = balanced, 100 = all positive), by ${series.grain}. Periods with fewer than ${MIN_SAMPLE} analysed reviews are left blank.`}
        >
          <TimeSeriesChart
            data={points}
            series={competitors.map((c) => ({ key: c.id, label: c.name, colorIndex: c.colorIndex }))}
            yLabel="Sentiment index"
            yDomain={[0, 100]}
            referenceY={{ y: 50, label: "balanced" }}
            caption="Sentiment index per competitor over time"
          />
        </Panel>

        <Panel
          id="health"
          title="Competitive health"
          description="Overall sentiment index, average star rating and the highest / lowest scoring aspect per competitor (aspects need ≥ 30 mentions to be ranked)."
          bodyClassName="p-0"
        >
          <HealthTable rows={health} range={w.key} />
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel id="drivers" title="Top customer drivers" description={`Aspects ranked by share of voice: mentions ÷ ${fmtInt(drivers.analysedReviews)} analysed reviews in range.`}>
            <ul className="space-y-3">
              {drivers.rows.map((d) => (
                <li key={d.aspect.id} className="grid grid-cols-[minmax(0,10rem)_3.5rem_1fr] items-center gap-3 text-sm">
                  <Link href={`/reviews${qs({ aspect: d.aspect.key })}`} className="truncate hover:underline">
                    {d.aspect.label}
                  </Link>
                  <span className="text-right text-fg-muted tabular" title={`${d.mentions} mentions`}>
                    {fmtPct(d.shareOfVoice, 1)}
                  </span>
                  <SentimentSplit pos={d.pos} neu={d.neu} neg={d.neg} />
                </li>
              ))}
            </ul>
            <p className="mt-4 flex gap-4 text-xs text-fg-subtle">
              <Legend color="var(--chart-positive)" label="Positive" />
              <Legend color="var(--chart-neutral)" label="Neutral" />
              <Legend color="var(--chart-negative)" label="Negative" />
            </p>
          </Panel>

          <Panel
            id="emerging"
            title="Emerging issues"
            description="Complaint shares that rose significantly in the latest analysis run (two-proportion z-test)."
            actions={
              <Link href="/trends" className="text-xs text-accent hover:underline">
                Trends
              </Link>
            }
          >
            {issues.length === 0 ? (
              <EmptyState title="No emerging issues detected" description="No aspect met all three rules: ≥ 20 recent negative mentions, ≥ 25% relative increase and p < 0.05." className="py-6" />
            ) : (
              <ul className="divide-y divide-border">
                {issues.map((i) => (
                  <li key={i.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {i.competitor.name} · {i.aspectCategory.label}
                        <span className="ml-2 font-normal text-fg-subtle">
                          {i.kind === "APP_VERSION" ? `from app version ${i.appVersion}` : `last ${Math.round((i.recentEnd.getTime() - i.recentStart.getTime()) / 86_400_000)} days`}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted tabular">
                        Negative mentions per review {fmtPct(i.prevShare, 1)} ({i.prevNegative}/{i.prevTotal}) → {fmtPct(i.recentShare, 1)} ({i.recentNegative}/{i.recentTotal}) · z = {i.zStatistic.toFixed(2)}, p {fmtP(i.pValue)}
                      </p>
                    </div>
                    <Link
                      href={`/reviews${qs({ competitor: i.competitor.slug, aspect: i.aspectCategory.key, aspectSentiment: "NEGATIVE", ...(i.kind === "APP_VERSION" ? { minVersion: i.appVersion } : { from: i.recentStart.toISOString().slice(0, 10) }) })}`}
                      className="shrink-0 self-center text-xs text-accent hover:underline"
                    >
                      Evidence
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          id="opportunities"
          title="Opportunities"
          description="Generated from computed findings; each links to the reviews behind it."
          actions={
            <Link href="/insights" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              All insights <ArrowRight className="size-3" aria-hidden />
            </Link>
          }
        >
          {opportunities.length === 0 ? (
            <EmptyState title="No opportunities yet" description="Opportunities appear when the analysis finds competitive gaps, market-wide weaknesses or emerging issues." className="py-6" />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {opportunities.map((o) => (
                <InsightCard key={o.id} insight={o} compact />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function AddCompetitorButton({ readOnlyReason }: { readOnlyReason: string | null }) {
  if (readOnlyReason)
    return (
      <DisabledButton reason={readOnlyReason} variant="primary">
        Add competitor
      </DisabledButton>
    );
  return (
    <Button variant="primary" asChild>
      <Link href="/competitors/new">Add competitor</Link>
    </Button>
  );
}

function NoMarket() {
  return (
    <Panel>
      <EmptyState title="No market in this workspace" description="Switch to another workspace from the top bar, or create a new account to get your own workspace." />
    </Panel>
  );
}

import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TimeSeriesChart, type Marker, type Point } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { UrlFilters } from "@/components/url-filters";
import { RANGES } from "@/lib/date-range";
import { fmt2, fmtDate, fmtInt, fmtMonthShort, fmtP, fmtPct, fmtShortDate } from "@/lib/format";
import { MIN_SAMPLE, sentimentIndex } from "@/lib/metrics";
import { cn, qs } from "@/lib/utils";
import { getMarketContext } from "@/server/context";
import { getAspects, getCompetitors, getEmergingIssues } from "@/server/data/analytics";
import { getMarketMeta, getWindow } from "@/server/data/meta";
import { getComplaintShare, getRatingSeries, getSentimentByGrain, getTopics, getTopicSeries } from "@/server/data/trends";

export const metadata: Metadata = { title: "Trends" };

const label = (grain: string, iso: string) => (grain === "month" ? fmtMonthShort(iso) : grain === "week" ? `Week of ${fmtShortDate(iso)}` : fmtShortDate(iso));

/** Periods with fewer than this many reviews are hidden from per-period lines (small-sample noise). */
const PERIOD_MIN = 10;

export default async function TrendsPage({ searchParams }: PageProps<"/trends">) {
  const sp = await searchParams;
  const ctx = await getMarketContext();
  const [meta, competitors, aspects] = await Promise.all([getMarketMeta(ctx), getCompetitors(ctx), getAspects(ctx)]);
  const w = await getWindow(ctx, sp.range, "90d");
  if (!w || !meta.latestRun) {
    return (
      <>
        <PageHeader title="Trends" />
        <Panel>
          <EmptyState title="No analysed data yet" description="Trends appear after the first analysis run." />
        </Panel>
      </>
    );
  }
  const focus = competitors.find((c) => c.slug === sp.competitor);
  const [complaints, ratings, sentiment, issues, topics] = await Promise.all([
    getComplaintShare(ctx, w, focus?.id),
    getRatingSeries(ctx, w),
    getSentimentByGrain(ctx, w),
    getEmergingIssues(ctx, meta.latestRun.id),
    getTopics(ctx),
  ]);
  const grain = complaints.grain;
  const periods = [...new Set([...complaints.totals.map((t) => t.period.toISOString()), ...sentiment.rows.map((r) => r.period.toISOString())])].sort();

  // 1. Sentiment index per competitor
  const sentPoints: Point[] = periods.map((p) => {
    const row: Point = { x: p, xLabel: label(grain, p) };
    for (const c of competitors) {
      const r = sentiment.rows.find((x) => x.competitor_id === c.id && x.period.toISOString() === p);
      const n = r ? r.pos + r.neu + r.neg : 0;
      row[c.id] = r && n >= PERIOD_MIN ? sentimentIndex(r.pos, r.neu, r.neg) : null;
      row[`${c.id}__n`] = n;
    }
    return row;
  });

  // 2. Complaint share by aspect (top 5 aspects by complaint volume in range)
  const volume = new Map<string, number>();
  for (const r of complaints.neg) volume.set(r.aspect_key, (volume.get(r.aspect_key) ?? 0) + r.neg);
  const topAspects = aspects.filter((a) => volume.has(a.key)).sort((a, b) => (volume.get(b.key) ?? 0) - (volume.get(a.key) ?? 0)).slice(0, 5);
  const compPoints: Point[] = periods.map((p) => {
    const row: Point = { x: p, xLabel: label(grain, p) };
    const total = complaints.totals.find((t) => t.period.toISOString() === p)?.n ?? 0;
    for (const a of topAspects) {
      const neg = complaints.neg.find((r) => r.aspect_key === a.key && r.period.toISOString() === p)?.neg ?? 0;
      row[a.key] = total >= PERIOD_MIN ? (neg / total) * 100 : null;
      row[`${a.key}__n`] = total;
    }
    return row;
  });
  // Emerging issues marked on the chart (time-window findings for the focused competitor)
  const markers: Marker[] = issues
    .filter((i) => i.kind === "TIME_WINDOW" && (!focus || i.competitorId === focus.id) && topAspects.some((a) => a.key === i.aspectCategory.key))
    .map((i) => {
      const end = i.recentEnd.getTime();
      const x = [...periods].reverse().find((p) => new Date(p).getTime() <= end) ?? periods[periods.length - 1];
      return { x, seriesKey: i.aspectCategory.key, label: `Emerging issue: ${i.competitor.name} · ${i.aspectCategory.label} (z = ${fmt2(i.zStatistic)}, p ${fmtP(i.pValue)})` };
    });

  // 3. Average rating
  const ratingPoints: Point[] = periods.map((p) => {
    const row: Point = { x: p, xLabel: label(grain, p) };
    for (const c of competitors) {
      const r = ratings.rows.find((x) => x.competitor_id === c.id && x.period.toISOString() === p);
      row[c.id] = r && r.n >= PERIOD_MIN ? r.avg : null;
      row[`${c.id}__n`] = r?.n ?? 0;
    }
    return row;
  });

  // 4. Topics over time (top 5 themes)
  const topTopics = topics.slice(0, 5);
  const topicRows = await getTopicSeries(ctx, w, topTopics.map((t) => t.id));
  const topicPoints: Point[] = periods.map((p) => {
    const row: Point = { x: p, xLabel: label(grain, p) };
    for (const t of topTopics) row[t.id] = topicRows.find((r) => r.topic_id === t.id && r.period.toISOString() === p)?.n ?? 0;
    return row;
  });

  return (
    <>
      <PageHeader
        title="Trends"
        description={`How sentiment, complaints and ratings move over time, by ${grain}. Periods with fewer than ${PERIOD_MIN} reviews are left blank; aspect scores elsewhere need ${MIN_SAMPLE}.`}
        meta={
          <span>
            {w.label}: {fmtDate(w.from)} – {fmtDate(meta.asOf!)}
          </span>
        }
      />
      <nav aria-label="Time range" className="mb-4 flex flex-wrap gap-1">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/trends${qs({ range: r.key, competitor: focus?.slug })}`}
            aria-current={w.key === r.key ? "page" : undefined}
            className={cn("rounded-md border px-2.5 py-1 text-sm", w.key === r.key ? "border-border-strong bg-bg-muted font-medium" : "border-border text-fg-muted hover:text-fg")}
          >
            {r.key === "1y" ? "1y" : r.key === "all" ? "All" : r.key}
          </Link>
        ))}
      </nav>
      <div className="grid gap-5">
        <Panel title="Sentiment index over time" description="0 = all negative, 50 = balanced, 100 = all positive.">
          <TimeSeriesChart data={sentPoints} series={competitors.map((c) => ({ key: c.id, label: c.name, colorIndex: c.colorIndex }))} yLabel="Sentiment index" yDomain={[0, 100]} referenceY={{ y: 50, label: "balanced" }} caption="Sentiment index over time" />
        </Panel>
        <Panel
          title="Complaint share by aspect"
          description="Negative mentions of an aspect per 100 analysed reviews — the measure used for emerging-issue detection. Amber dots mark detected emerging issues; hover for the test statistic."
          actions={
            <Suspense>
              <UrlFilters fields={[{ key: "competitor", label: "Competitor", options: competitors.map((c) => ({ value: c.slug, label: c.name })), allLabel: "All competitors" }]} keep={["range"]} />
            </Suspense>
          }
        >
          <TimeSeriesChart data={compPoints} series={topAspects.map((a, i) => ({ key: a.key, label: a.label, colorIndex: i }))} yLabel="Per 100 reviews" valueFormat="1dp" caption="Complaint share by aspect" markers={markers} />
        </Panel>
        <Panel title="Average star rating" description="Mean user rating per period (1–5).">
          <TimeSeriesChart data={ratingPoints} series={competitors.map((c) => ({ key: c.id, label: c.name, colorIndex: c.colorIndex }))} yLabel="Stars" yDomain={[1, 5]} valueFormat="2dp" caption="Average star rating over time" />
        </Panel>
        <Panel title="Discovered themes over time" description="Negative clauses per period for the five largest themes found by topic discovery.">
          {topTopics.length === 0 ? (
            <EmptyState title="No themes discovered" className="py-6" />
          ) : (
            <TimeSeriesChart data={topicPoints} series={topTopics.map((t, i) => ({ key: t.id, label: t.label, colorIndex: i }))} yLabel="Clauses" caption="Discovered themes over time" />
          )}
        </Panel>
        <Panel title="Uncategorised themes" description="Complaint themes found by clustering negative clauses that no fixed aspect category picked up. Review them to decide whether a new category is needed.">
          {topics.length === 0 ? (
            <EmptyState title="No themes in the latest run" className="py-6" />
          ) : (
            <ul className="divide-y divide-border">
              {topics.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">Keywords: {t.keywords.join(", ")}</p>
                  </div>
                  <span className="text-xs text-fg-subtle tabular">{fmtInt(t.size)} clauses</span>
                  {t.isUncategorised ? (
                    <Badge tone="info" casing="normal">Uncategorised</Badge>
                  ) : (
                    <Badge tone="outline" casing="normal" title="The theme is close to an existing category — probably phrasing the lexicon missed">
                      Close to {aspects.find((a) => a.key === t.nearestAspectKey)?.label ?? t.nearestAspectKey}
                    </Badge>
                  )}
                  <Link href={`/reviews?topic=${t.id}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    Example reviews <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Emerging issues" description="All findings from the latest run with their statistics.">
          {issues.length === 0 ? (
            <EmptyState title="No emerging issues" className="py-6" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {issues.map((i) => (
                <li key={i.id} className="py-2">
                  <span className="font-medium">
                    {i.competitor.name} · {i.aspectCategory.label}
                  </span>{" "}
                  <span className="text-fg-muted tabular">
                    {i.kind === "APP_VERSION" ? `versions ≥ ${i.appVersion} vs earlier` : `last 30 days vs previous 30`}: {fmtPct(i.prevShare, 1)} → {fmtPct(i.recentShare, 1)} · z = {fmt2(i.zStatistic)} · p {fmtP(i.pValue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

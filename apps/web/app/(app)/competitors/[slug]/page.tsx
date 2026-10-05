import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeSeriesChart, type Point } from "@/components/charts/charts";
import { Badge, ConfidenceBadge } from "@/components/ui/badge";
import { PageHeader, Panel, Stat } from "@/components/ui/panel";
import { ScoreBar, SentimentSplit } from "@/components/ui/score-bar";
import { EmptyState, NotEnoughData } from "@/components/ui/states";
import { stickyCol, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InsightCard } from "@/features/insights/insight-card";
import { competitorColor, SOURCE_LABEL } from "@/lib/constants";
import { fmt1, fmtDate, fmtInt, fmtMonthShort, fmtP, fmtPct, fmtScore, fmtSigned } from "@/lib/format";
import { MIN_SAMPLE, scoreStats } from "@/lib/metrics";
import { cn, qs } from "@/lib/utils";
import { getMarketContext } from "@/server/context";
import { getCompetitorTotals, getEmergingIssues } from "@/server/data/analytics";
import {
  getAspectProfile,
  getCompetitorAspectTrend,
  getCompetitorBySlug,
  getRepresentativeExcerpts,
  getSentimentDistribution,
  type AspectProfileRow,
} from "@/server/data/competitors";
import { listInsights } from "@/server/data/insights";
import { getMarketMeta, getWindow } from "@/server/data/meta";
import { AppError } from "@/server/errors";
import { AwaitingRun } from "@/features/dashboard/awaiting-run";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "voice", label: "Customer Voice" },
  { key: "strengths", label: "Strengths" },
  { key: "weaknesses", label: "Weaknesses" },
  { key: "trends", label: "Trends" },
  { key: "position", label: "Competitive Position" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export async function generateMetadata({ params }: PageProps<"/competitors/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default async function CompetitorPage({ params, searchParams }: PageProps<"/competitors/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getMarketContext();
  let competitor;
  try {
    competitor = await getCompetitorBySlug(ctx, slug);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const tab: Tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "overview") as Tab;
  const meta = await getMarketMeta(ctx);
  const w = await getWindow(ctx, sp.range);
  const header = (
    <PageHeader
      title={
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: competitorColor(competitor.colorIndex) }} aria-hidden />
          {competitor.name}
        </span>
      }
      description={competitor.description ?? undefined}
      meta={
        <>
          {competitor.dataSources.map((d) => (
            <span key={d.id}>
              {SOURCE_LABEL[d.kind] ?? d.kind}
              {d.externalId ? ` · ${d.externalId}` : ""}
            </span>
          ))}
          {w && (
            <span>
              {w.label}: {fmtDate(w.from)} – {fmtDate(meta.asOf!)}
            </span>
          )}
          {competitor.status === "ARCHIVED" && <Badge tone="outline">Archived</Badge>}
        </>
      }
    />
  );
  if (!meta.latestRun || !w) {
    return (
      <>
        {header}
        <AwaitingRun reviewCount={meta.reviewCount} />
      </>
    );
  }

  const range = w.key;
  const nav = (
    <nav aria-label="Competitor sections" className="-mt-1 mb-5 overflow-x-auto border-b border-border">
      <ul className="flex gap-1">
        {TABS.map((t) => (
          <li key={t.key}>
            <Link
              href={`/competitors/${competitor.slug}${qs({ tab: t.key === "overview" ? undefined : t.key, range })}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "inline-block border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                tab === t.key ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  const profile = await getAspectProfile(ctx, competitor.id, w.from, w.to);
  const evidenceHref = (aspect: string, s?: string) => `/reviews${qs({ competitor: competitor.slug, aspect, aspectSentiment: s, from: w.from.toISOString().slice(0, 10) })}`;

  let body: React.ReactNode;
  if (tab === "overview") {
    const [dist, totals, insights] = await Promise.all([
      getSentimentDistribution(ctx, competitor.id, w.from, w.to),
      getCompetitorTotals(ctx, w.from, w.to),
      listInsights(ctx, { competitor: competitor.slug, type: "OBSERVATION" }, 6),
    ]);
    const t = totals.get(competitor.id);
    const sent = scoreStats(dist.pos, dist.neu, dist.neg);
    const maxRating = Math.max(1, ...dist.ratings.map((r) => r.n));
    body = (
      <div className="grid gap-5">
        <Panel>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat label="Reviews in range" value={fmtInt(t?.reviews ?? 0)} sub={`${fmtInt(t?.analysed ?? 0)} analysed · ${fmtInt(t?.otherLanguage ?? 0)} other languages`} />
            <Stat label="Average rating" value={t?.avgRating ? `${fmt1(t.avgRating)} / 5` : "—"} sub="user star ratings" />
            <Stat label="Sentiment index" value={sent.enoughData ? fmtScore(sent.score) : <NotEnoughData n={sent.n} />} sub="0–100, from review text" />
            <Stat label="Negative reviews" value={sent.n ? fmtPct(dist.neg / sent.n) : "—"} sub={`of ${fmtInt(sent.n)} analysed`} />
          </div>
        </Panel>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Sentiment distribution" description="Overall review sentiment from the transformer model.">
            <SentimentSplit pos={dist.pos} neu={dist.neu} neg={dist.neg} className="h-3" />
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              {[["Positive", dist.pos], ["Neutral", dist.neu], ["Negative", dist.neg]].map(([l, n]) => (
                <div key={l as string}>
                  <dt className="text-xs text-fg-subtle">{l}</dt>
                  <dd className="tabular">
                    {fmtInt(n as number)} <span className="text-fg-subtle">({sent.n ? fmtPct((n as number) / sent.n) : "—"})</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Star ratings" description="What reviewers chose on the store (not computed).">
            <ul className="space-y-1.5">
              {[...dist.ratings].reverse().map((r) => (
                <li key={r.rating} className="grid grid-cols-[3rem_1fr_3.5rem] items-center gap-2 text-sm">
                  <span className="text-fg-muted tabular">{r.rating} ★</span>
                  <span className="h-2 rounded-full bg-bg-muted">
                    <span className="block h-2 rounded-full bg-fg-subtle" style={{ width: `${(r.n / maxRating) * 100}%` }} />
                  </span>
                  <span className="text-right tabular text-fg-muted">{fmtInt(r.n)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <Panel title="Findings" description="Computed observations about this competitor from the latest analysis run.">
          {insights.length === 0 ? (
            <EmptyState title="No findings for this competitor" className="py-6" />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {insights.map((i) => (
                <InsightCard key={i.id} insight={i} compact />
              ))}
            </div>
          )}
        </Panel>
      </div>
    );
  } else if (tab === "voice") {
    const excerpts = await Promise.all(
      profile
        .filter((p) => p.stats.n > 0)
        .map(async (p) => ({
          key: p.key,
          pos: await getRepresentativeExcerpts(ctx, competitor.id, p.key, "POSITIVE", w.from, w.to, 2),
          neg: await getRepresentativeExcerpts(ctx, competitor.id, p.key, "NEGATIVE", w.from, w.to, 2),
        })),
    );
    body = (
      <div className="grid gap-5">
        <Panel title="Aspect scores" description="Score 0–100 per aspect with share of voice. Hover a score for its 95% Wilson intervals. Aspects with fewer than 30 mentions show “Not enough data”." bodyClassName="p-0">
          <AspectTable rows={profile} evidenceHref={evidenceHref} />
        </Panel>
        <Panel title="Representative excerpts" description="The most confident mentions per aspect, with the detected phrase highlighted.">
          <div className="grid gap-4 lg:grid-cols-2">
            {profile
              .filter((p) => p.stats.n > 0)
              .map((p) => {
                const ex = excerpts.find((e) => e.key === p.key)!;
                return (
                  <div key={p.key} className="rounded-md border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-medium">{p.label}</h3>
                      <Link href={evidenceHref(p.key)} className="text-xs text-accent hover:underline">
                        View reviews
                      </Link>
                    </div>
                    <ul className="space-y-2">
                      {[...ex.neg, ...ex.pos].map((e) => (
                        <li key={`${e.reviewId}-${e.sentiment}`} className="text-sm leading-relaxed text-fg-muted">
                          <Badge tone={e.sentiment === "POSITIVE" ? "positive" : "negative"} casing="normal" className="mr-1.5">
                            {e.sentiment === "POSITIVE" ? "Positive" : "Negative"}
                          </Badge>
                          {e.text.slice(0, e.matchStart ?? 0)}
                          <mark className={cn("rounded-[2px] px-0.5 text-fg underline decoration-2 underline-offset-2", e.sentiment === "POSITIVE" ? "bg-positive-bg decoration-positive" : "bg-negative-bg decoration-negative")}>
                            {e.text.slice(e.matchStart ?? 0, e.matchEnd ?? 0)}
                          </mark>
                          {e.text.slice(e.matchEnd ?? 0)}
                          <span className="ml-1 text-xs text-fg-subtle tabular">· {e.rating}★ · {fmtDate(e.reviewedAt)}</span>
                        </li>
                      ))}
                      {ex.neg.length + ex.pos.length === 0 && <li className="text-xs text-fg-subtle">No highlighted excerpts in range.</li>}
                    </ul>
                  </div>
                );
              })}
          </div>
        </Panel>
      </div>
    );
  } else if (tab === "strengths" || tab === "weaknesses") {
    const ranked = profile.filter((p) => p.stats.enoughData).sort((a, b) => (b.stats.score! - a.stats.score!) || b.stats.n - a.stats.n);
    const list = tab === "strengths" ? ranked : [...ranked].reverse();
    const insufficient = profile.filter((p) => !p.stats.enoughData && p.stats.n > 0);
    body = (
      <Panel
        title={tab === "strengths" ? "Strengths — ranked" : "Weaknesses — ranked"}
        description="Ranked by aspect score; ties broken by mention volume. Only aspects with at least 30 mentions are ranked (CLAUDE.md §5). Trend compares with the previous period of equal length."
      >
        <ol className="divide-y divide-border">
          {list.map((p, i) => (
            <li key={p.key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-3 sm:grid-cols-[2rem_12rem_minmax(10rem,1fr)_auto_auto_auto]">
              <span className="text-sm text-fg-subtle tabular">#{i + 1}</span>
              <span className="text-sm font-medium">{p.label}</span>
              <span className="col-start-2 sm:col-start-auto">
                <ScoreBar stats={p.stats} />
              </span>
              <span className="col-start-2 text-xs text-fg-muted tabular sm:col-start-auto">n = {fmtInt(p.stats.n)}</span>
              <span className="col-start-2 flex items-center gap-2 sm:col-start-auto">
                <ConfidenceBadge value={p.stats.confidence} />
                <TrendBadge row={p} />
              </span>
              <Link href={evidenceHref(p.key, tab === "strengths" ? "POSITIVE" : "NEGATIVE")} className="col-start-2 inline-flex items-center gap-1 text-xs text-accent hover:underline sm:col-start-auto">
                View reviews <ArrowRight className="size-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
        {list.length === 0 && <EmptyState title="Not enough data to rank aspects" description={`No aspect has ${MIN_SAMPLE} or more mentions in this range. Try a longer range.`} className="py-6" />}
        {insufficient.length > 0 && (
          <p className="mt-4 text-xs text-fg-subtle">
            Not ranked (fewer than {MIN_SAMPLE} mentions): {insufficient.map((p) => `${p.label} (n = ${p.stats.n})`).join(", ")}.
          </p>
        )}
      </Panel>
    );
  } else if (tab === "trends") {
    const [aggs, issues] = await Promise.all([getCompetitorAspectTrend(ctx, competitor.id, w.from), getEmergingIssues(ctx, meta.latestRun.id)]);
    const mine = issues.filter((i) => i.competitorId === competitor.id);
    const months = [...new Set(aggs.map((a) => a.periodStart.toISOString()))].sort();
    const topAspects = [...profile].sort((a, b) => b.stats.n - a.stats.n).slice(0, 4);
    const points: Point[] = months.map((m) => {
      const row: Point = { x: m, xLabel: fmtMonthShort(m) };
      for (const a of topAspects) {
        const g = aggs.find((x) => x.periodStart.toISOString() === m && x.aspectCategory.key === a.key);
        row[a.key] = g?.score ?? null;
        row[`${a.key}__n`] = g?.mentions ?? 0;
      }
      return row;
    });
    body = (
      <div className="grid gap-5">
        <Panel title="Monthly aspect scores" description={`The ${topAspects.length} most-mentioned aspects. Months with fewer than ${MIN_SAMPLE} mentions are left blank (pipeline aggregates).`}>
          <TimeSeriesChart data={points} series={topAspects.map((a, i) => ({ key: a.key, label: a.label, colorIndex: i }))} yLabel="Aspect score" yDomain={[0, 100]} referenceY={{ y: 50, label: "balanced" }} caption={`Monthly aspect scores for ${competitor.name}`} />
        </Panel>
        <Panel title="Emerging issues for this competitor">
          {mine.length === 0 ? (
            <EmptyState title="No emerging issues in the latest run" className="py-6" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {mine.map((i) => (
                <li key={i.id} className="py-2">
                  <span className="font-medium">{i.aspectCategory.label}</span>{" "}
                  <span className="text-fg-muted tabular">
                    {i.kind === "APP_VERSION" ? `from v${i.appVersion}: ` : "last 30 days: "}
                    {fmtPct(i.prevShare, 1)} → {fmtPct(i.recentShare, 1)} of reviews negative on this aspect (z = {i.zStatistic.toFixed(2)}, p {fmtP(i.pValue)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    );
  } else {
    body = (
      <Panel title="Competitive position" description="This competitor's aspect score against the median of the other competitors with enough data. A gap is flagged when the difference is at least 10 points and the score intervals do not overlap." bodyClassName="p-0">
        <Table>
          <caption className="sr-only">Aspect scores versus market median</caption>
          <THead>
            <tr>
              <TH>Aspect</TH>
              <TH>{competitor.name}</TH>
              <TH numeric>Market median</TH>
              <TH numeric>Difference</TH>
              <TH>Assessment</TH>
            </tr>
          </THead>
          <TBody>
            {profile.map((p) => (
              <TR key={p.key}>
                <TD className={`${stickyCol} whitespace-nowrap`}>{p.label}</TD>
                <TD>
                  <ScoreBar stats={p.stats} />
                </TD>
                <TD numeric>{p.gap ? fmtScore(p.gap.median) : "—"}</TD>
                <TD numeric>{p.gap ? fmtSigned(p.gap.difference) : "—"}</TD>
                <TD className="whitespace-nowrap">
                  {!p.gap ? (
                    <span className="text-xs text-fg-subtle">Not comparable</span>
                  ) : p.gap.isGap ? (
                    <Badge tone={p.gap.difference > 0 ? "positive" : "negative"} casing="normal">
                      {p.gap.difference > 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}
                      {p.gap.difference > 0 ? "Leads market" : "Trails market"}
                    </Badge>
                  ) : (
                    <span className="text-xs text-fg-subtle">No meaningful difference</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Panel>
    );
  }

  return (
    <>
      {header}
      {nav}
      {body}
    </>
  );
}

function TrendBadge({ row }: { row: AspectProfileRow }) {
  if (!row.trend) return <span className="text-xs text-fg-subtle">no trend data</span>;
  const map = {
    up: { Icon: ArrowUpRight, label: "Improving", tone: "positive" as const },
    down: { Icon: ArrowDownRight, label: "Declining", tone: "negative" as const },
    flat: { Icon: Minus, label: "Stable", tone: "outline" as const },
  }[row.trend];
  return (
    <Badge tone={map.tone} casing="normal" title={`Previous period score ${fmtScore(row.prevScore)}`}>
      <map.Icon aria-hidden /> {map.label}
    </Badge>
  );
}

function AspectTable({ rows, evidenceHref }: { rows: AspectProfileRow[]; evidenceHref: (k: string) => string }) {
  return (
    <Table>
      <caption className="sr-only">Aspect scores</caption>
      <THead>
        <tr>
          <TH>Aspect</TH>
          <TH>Score</TH>
          <TH numeric>Mentions (n)</TH>
          <TH numeric>Share of voice</TH>
          <TH>Confidence</TH>
          <TH>Sentiment split</TH>
          <TH className="text-right">Evidence</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((p) => (
          <TR key={p.key}>
            <TD className={`${stickyCol} whitespace-nowrap`}>{p.label}</TD>
            <TD>
              <ScoreBar stats={p.stats} />
            </TD>
            <TD numeric>{fmtInt(p.stats.n)}</TD>
            <TD numeric>{fmtPct(p.shareOfVoice, 1)}</TD>
            <TD>{p.stats.enoughData ? <ConfidenceBadge value={p.stats.confidence} /> : <span className="text-xs text-fg-subtle">—</span>}</TD>
            <TD className="min-w-32">
              <SentimentSplit pos={p.stats.pos} neu={p.stats.neu} neg={p.stats.neg} />
            </TD>
            <TD className="text-right">
              <Link href={evidenceHref(p.key)} className="text-xs text-accent hover:underline">
                View reviews
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

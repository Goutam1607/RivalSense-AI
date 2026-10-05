import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { ReviewFilters } from "@/features/reviews/review-filters";
import { ReviewRow } from "@/features/reviews/review-row";
import { fmtInt } from "@/lib/format";
import { getMarketContext } from "@/server/context";
import { getAspects, getCompetitors } from "@/server/data/analytics";
import { prisma } from "@/server/db/client";
import { getLanguages, listReviews, PAGE_SIZE, parseReviewFilters } from "@/server/data/reviews";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  const sp = await searchParams;
  const ctx = await getMarketContext();
  const filters = parseReviewFilters(sp);
  const [competitors, aspects, languages, sources, result, insight, topic] = await Promise.all([
    getCompetitors(ctx, true),
    getAspects(ctx),
    getLanguages(ctx),
    prisma.dataSource.findMany({
      where: { competitor: { marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } } },
      select: { kind: true },
      distinct: ["kind"],
    }),
    listReviews(ctx, filters),
    filters.insight
      ? prisma.insight.findFirst({ where: { id: filters.insight, marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } }, select: { title: true, type: true } })
      : null,
    filters.topic
      ? prisma.topic.findFirst({ where: { id: filters.topic, marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } }, select: { label: true } })
      : null,
  ]);
  const page1 = !filters.cursor;
  const nextHref = (() => {
    if (!result.nextCursor) return null;
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    p.set("cursor", result.nextCursor);
    return `/reviews?${p.toString()}`;
  })();
  const firstHref = (() => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "cursor" ? [[k, v]] : [])));
    return `/reviews?${p.toString()}`;
  })();

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Every review in this market with the aspects and sentiment the pipeline detected. Filters live in the URL, so any view can be shared."
      />
      <Suspense>
        <ReviewFilters
          competitors={competitors.map((c) => ({ value: c.slug, label: c.name }))}
          aspects={aspects.map((a) => ({ value: a.key, label: a.label }))}
          languages={languages}
          sources={sources.map((s) => s.kind)}
        />
      </Suspense>
      {(insight || topic) && (
        <p className="mt-3 rounded-md border border-info-border bg-info-bg px-3 py-2 text-sm">
          Showing evidence for {insight ? <>insight “{insight.title}”</> : <>theme “{topic!.label}”</>}.{" "}
          <Link href="/reviews" className="text-accent underline underline-offset-2">
            Show all reviews
          </Link>
        </p>
      )}
      <Panel
        className="mt-4"
        bodyClassName="p-0"
        title={
          <span className="tabular" aria-live="polite">
            {fmtInt(result.total)} review{result.total === 1 ? "" : "s"}
          </span>
        }
        description={result.total > PAGE_SIZE ? `Showing ${PAGE_SIZE} per page, newest first.` : "Newest first."}
      >
        {result.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No reviews match these filters"
            description="Try a wider date range or fewer filters."
            action={
              <Button variant="secondary" asChild>
                <Link href="/reviews">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <ul>
            {result.items.map((r) => (
              <ReviewRow key={r.id} r={r} />
            ))}
          </ul>
        )}
        {(nextHref || !page1) && (
          <nav aria-label="Pagination" className="flex items-center justify-between border-t border-border px-4 py-3">
            {!page1 ? (
              <Link href={firstHref} className="text-sm text-accent hover:underline">
                ← First page
              </Link>
            ) : (
              <span />
            )}
            {nextHref && (
              <Button variant="secondary" asChild>
                <Link href={nextHref}>Next {PAGE_SIZE} →</Link>
              </Button>
            )}
          </nav>
        )}
      </Panel>
    </>
  );
}

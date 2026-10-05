import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { ConfidenceBadge, ImpactBadge, InsightTypeBadge } from "@/components/ui/badge";
import { SUGGESTION_LABEL, type InsightTypeKey } from "@/lib/constants";
import { fmtDate, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { insightText, type InsightRow } from "@/server/data/insights";

export function InsightCard({ insight, compact = false, className }: { insight: InsightRow; compact?: boolean; className?: string }) {
  const type = insight.type as InsightTypeKey;
  const isSuggestion = type !== "OBSERVATION";
  return (
    <article className={cn("rounded-lg border border-border bg-bg p-4", className)} aria-labelledby={`insight-${insight.id}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <InsightTypeBadge type={type} />
        {insight.competitor && <span className="text-xs text-fg-muted">{insight.competitor.name}</span>}
        {insight.aspectCategory && <span className="text-xs text-fg-subtle">· {insight.aspectCategory.label}</span>}
      </div>
      <h3 id={`insight-${insight.id}`} className="mt-2 text-md font-medium text-fg">
        {insight.title}
      </h3>
      <p className="mt-1 text-sm text-fg-muted">{insightText(insight)}</p>
      {isSuggestion && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-fg-subtle">
          <Info className="size-3.5" aria-hidden />
          {SUGGESTION_LABEL}
        </p>
      )}
      {!compact && insight.suggestedInvestigation && (
        <p className="mt-3 rounded-md bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
          <span className="font-medium text-fg">Suggested investigation: </span>
          {insight.suggestedInvestigation}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3 text-xs text-fg-subtle">
        <span className="tabular">
          Evidence: {fmtInt(insight._count.evidence)} linked reviews · based on n = {fmtInt(insight.sampleSize)}
        </span>
        <span className="tabular">
          {fmtDate(insight.dateFrom)} – {fmtDate(insight.dateTo)}
        </span>
        {!compact && <span>{insight.sources.join(", ")}</span>}
        <ConfidenceBadge value={insight.confidence} />
        {!compact && <ImpactBadge value={insight.impact} />}
        {!compact && (
          <span title="Who wrote this wording">{insight.writtenBy === "template" ? "Wording: template" : `Wording: ${insight.writtenBy} (validated)`}</span>
        )}
        <Link href={`/reviews?insight=${insight.id}`} className="ml-auto inline-flex items-center gap-1 text-accent hover:underline">
          View evidence <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

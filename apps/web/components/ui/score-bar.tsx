import { fmtPct, fmtScore } from "@/lib/format";
import type { ScoreStats } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./badge";
import { NotEnoughData } from "./states";
import { Tooltip } from "./tooltip";

function tone(score: number) {
  return score >= 60 ? "bg-positive" : score < 45 ? "bg-negative" : "bg-fg-subtle";
}

/**
 * Computed 0–100 score as a bar (never stars — stars are reserved for user ratings).
 * The tick marks show the score interval; hover/focus reveals the Wilson intervals and n.
 */
export function ScoreBar({ stats, className, showConfidence = false }: { stats: ScoreStats; className?: string; showConfidence?: boolean }) {
  if (!stats.enoughData || stats.score === null) return <NotEnoughData n={stats.n} />;
  const s = stats.score;
  const [lo, hi] = stats.scoreInterval.map((x) => Math.max(0, Math.min(100, x)));
  const detail = (
    <div className="space-y-1">
      <div className="font-medium">
        Score {fmtScore(s)} / 100 · n = {stats.n} mentions
      </div>
      <div>
        Positive {fmtPct(stats.pos / stats.n)} (95% CI {fmtPct(stats.posInterval[0])}–{fmtPct(stats.posInterval[1])})
      </div>
      <div>
        Negative {fmtPct(stats.neg / stats.n)} (95% CI {fmtPct(stats.negInterval[0])}–{fmtPct(stats.negInterval[1])})
      </div>
      <div className="text-fg-subtle">
        Score interval {fmtScore(lo)}–{fmtScore(hi)} · {stats.confidence?.toLowerCase()} confidence
      </div>
    </div>
  );
  return (
    <Tooltip content={detail}>
      <span tabIndex={0} className={cn("inline-flex min-w-36 items-center gap-2 rounded-sm outline-none", className)}>
        <span className="num w-7 text-right font-medium text-fg">{fmtScore(s)}</span>
        <span className="relative h-1.5 flex-1 rounded-full bg-bg-muted" aria-hidden>
          <span className={cn("absolute inset-y-0 left-0 rounded-full", tone(s))} style={{ width: `${s}%` }} />
          <span className="absolute -top-0.5 h-2.5 border-x border-fg-muted/60" style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 0.5)}%` }} />
        </span>
        <span className="sr-only">
          Score {fmtScore(s)} out of 100 from {stats.n} mentions; interval {fmtScore(lo)} to {fmtScore(hi)}
        </span>
        {showConfidence && <ConfidenceBadge value={stats.confidence} />}
      </span>
    </Tooltip>
  );
}

/** Stacked positive / neutral / negative split with text labels for screen readers. */
export function SentimentSplit({ pos, neu, neg, className }: { pos: number; neu: number; neg: number; className?: string }) {
  const n = pos + neu + neg;
  if (!n) return <span className="text-xs text-fg-subtle">No mentions</span>;
  const parts = [
    { v: pos, c: "bg-[var(--chart-positive)]", l: "positive" },
    { v: neu, c: "bg-[var(--chart-neutral)]", l: "neutral" },
    { v: neg, c: "bg-[var(--chart-negative)]", l: "negative" },
  ];
  return (
    <Tooltip
      content={
        <span className="tabular">
          {fmtPct(pos / n)} positive · {fmtPct(neu / n)} neutral · {fmtPct(neg / n)} negative (n = {n})
        </span>
      }
    >
      <span tabIndex={0} className={cn("flex h-2 w-full min-w-24 overflow-hidden rounded-full bg-bg-muted outline-none", className)}>
        {parts.map((p) => (
          <span key={p.l} className={p.c} style={{ width: `${(p.v / n) * 100}%` }} />
        ))}
        <span className="sr-only">
          {fmtPct(pos / n)} positive, {fmtPct(neu / n)} neutral, {fmtPct(neg / n)} negative of {n}
        </span>
      </span>
    </Tooltip>
  );
}

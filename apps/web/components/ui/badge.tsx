import { cva, type VariantProps } from "class-variance-authority";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import * as React from "react";
import { INSIGHT_TYPE_LABEL, type InsightTypeKey } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-px text-2xs font-medium uppercase tracking-wide [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-neutral-border bg-neutral-bg text-neutral",
        positive: "border-positive-border bg-positive-bg text-positive",
        negative: "border-negative-border bg-negative-bg text-negative",
        warning: "border-warning-border bg-warning-bg text-warning",
        info: "border-info-border bg-info-bg text-info",
        outline: "border-border bg-transparent text-fg-muted",
      },
      casing: { upper: "", normal: "normal-case tracking-normal" },
    },
    defaultVariants: { tone: "neutral", casing: "upper" },
  },
);

export function Badge({
  className,
  tone,
  casing,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, casing }), className)} {...props} />;
}

const SENTIMENT = {
  POSITIVE: { tone: "positive", label: "Positive", Icon: ArrowUpRight },
  NEUTRAL: { tone: "neutral", label: "Neutral", Icon: Minus },
  NEGATIVE: { tone: "negative", label: "Negative", Icon: ArrowDownRight },
} as const;

/** Sentiment label: colour + icon + text (never colour alone). */
export function SentimentBadge({ value, className, compact }: { value: keyof typeof SENTIMENT; className?: string; compact?: boolean }) {
  const s = SENTIMENT[value];
  return (
    <Badge tone={s.tone} casing="normal" className={className}>
      <s.Icon aria-hidden />
      {compact ? null : s.label}
      {compact ? <span className="sr-only">{s.label}</span> : null}
    </Badge>
  );
}

const INSIGHT_TONE: Record<InsightTypeKey, VariantProps<typeof badgeVariants>["tone"]> = {
  OBSERVATION: "info",
  INTERPRETATION: "outline",
  OPPORTUNITY: "positive",
  RECOMMENDATION: "warning",
};

export function InsightTypeBadge({ type, className }: { type: InsightTypeKey; className?: string }) {
  return (
    <Badge tone={INSIGHT_TONE[type]} className={className}>
      {INSIGHT_TYPE_LABEL[type]}
    </Badge>
  );
}

export function ConfidenceBadge({ value, className }: { value: "HIGH" | "MEDIUM" | "LOW" | null | undefined; className?: string }) {
  if (!value) return null;
  const label = value === "HIGH" ? "High" : value === "MEDIUM" ? "Medium" : "Low";
  return (
    <Badge tone="outline" casing="normal" className={className}>
      <span className="flex gap-px" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-[3px] rounded-[1px]",
              i < (value === "HIGH" ? 3 : value === "MEDIUM" ? 2 : 1) ? "bg-fg-muted" : "bg-border-strong",
            )}
          />
        ))}
      </span>
      {label} confidence
    </Badge>
  );
}

export function ImpactBadge({ value }: { value: "HIGH" | "MEDIUM" | "LOW" }) {
  return (
    <Badge tone={value === "HIGH" ? "warning" : "outline"} casing="normal">
      {value === "HIGH" ? "High" : value === "MEDIUM" ? "Medium" : "Low"} impact
    </Badge>
  );
}

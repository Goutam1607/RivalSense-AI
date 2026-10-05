import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, ConfidenceBadge, ImpactBadge, InsightTypeBadge, SentimentBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { PageHeader, Panel, Stat } from "@/components/ui/panel";
import { ScoreBar, SentimentSplit } from "@/components/ui/score-bar";
import { EmptyState, ErrorNotice, NotEnoughData, Skeleton } from "@/components/ui/states";
import { stickyCol, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DisabledButton } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme";
import { INSIGHT_TYPES } from "@/lib/constants";
import { scoreStats } from "@/lib/metrics";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

const TOKENS = ["bg", "bg-subtle", "bg-muted", "border", "border-strong", "fg", "fg-muted", "fg-subtle", "primary", "accent", "positive", "negative", "warning", "info"];
const CHART = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-positive", "chart-neutral", "chart-negative"];
const TYPE = [
  ["text-3xl", "Display — page hero"],
  ["text-2xl", "Section heading"],
  ["text-xl", "Page title"],
  ["text-lg", "Large body"],
  ["text-md", "Panel title"],
  ["text-base", "Body (default, 14px)"],
  ["text-sm", "Secondary text, tables"],
  ["text-xs", "Meta, labels"],
  ["text-2xs", "Badges"],
];

/** Development-only reference for the design tokens and components (CLAUDE.md §7). */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  // Illustrative values for component previews only (this page is not shown in production).
  const sample = scoreStats(120, 40, 60);
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader title="Design system" description="Tokens and components. Neutral greys for most of the UI; colour only carries meaning and is always paired with text or an icon." actions={<ThemeToggle />} />
      <div className="grid gap-6">
        <Panel title="Typography" description="Geist for text, Geist Mono with tabular numerals for numbers.">
          <div className="space-y-2">
            {TYPE.map(([cls, label]) => (
              <div key={cls} className="flex items-baseline gap-4">
                <code className="w-24 shrink-0 font-mono text-xs text-fg-subtle">{cls}</code>
                <span className={cls}>{label}</span>
              </div>
            ))}
            <p className="num">0123456789 · 1,234.56 (num / tabular numerals)</p>
          </div>
        </Panel>
        <Panel title="Colour tokens" description="CSS variables with light and dark values.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {TOKENS.map((t) => (
              <div key={t} className="text-xs">
                <div className="h-10 rounded-md border border-border" style={{ background: `var(--${t})` }} />
                <code className="mt-1 block font-mono text-fg-muted">--{t}</code>
              </div>
            ))}
          </div>
          <p className="mt-4 mb-2 text-xs text-fg-subtle">Chart palette (validated for colour-vision deficiency in light and dark)</p>
          <div className="flex flex-wrap gap-2">
            {CHART.map((t) => (
              <div key={t} className="text-xs">
                <div className="h-6 w-16 rounded-sm" style={{ background: `var(--${t})` }} />
                <code className="font-mono text-2xs text-fg-subtle">{t}</code>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button disabled>Disabled</Button>
            <DisabledButton reason="Requires an API key — see Settings">Disabled with reason</DisabledButton>
          </div>
        </Panel>
        <Panel title="Inputs">
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Field label="Text input" htmlFor="ds-a" hint="Helper text">
              <Input id="ds-a" placeholder="Placeholder" />
            </Field>
            <Field label="With error" htmlFor="ds-b" error="This field is required.">
              <Input id="ds-b" aria-invalid />
            </Field>
            <Field label="Select" htmlFor="ds-c">
              <NativeSelect id="ds-c">
                <option>Option</option>
              </NativeSelect>
            </Field>
            <Field label="Textarea" htmlFor="ds-d">
              <Textarea id="ds-d" />
            </Field>
          </div>
        </Panel>
        <Panel title="Badges">
          <div className="flex flex-wrap items-center gap-2">
            {INSIGHT_TYPES.map((t) => (
              <InsightTypeBadge key={t} type={t} />
            ))}
            <SentimentBadge value="POSITIVE" />
            <SentimentBadge value="NEUTRAL" />
            <SentimentBadge value="NEGATIVE" />
            <ConfidenceBadge value="HIGH" />
            <ConfidenceBadge value="MEDIUM" />
            <ConfidenceBadge value="LOW" />
            <ImpactBadge value="HIGH" />
            <Badge tone="warning">Demo dataset — synthetic</Badge>
          </div>
        </Panel>
        <Panel title="Data display">
          <div className="grid gap-6 sm:grid-cols-3">
            <Stat label="Stat" value="1,234" sub="sub-label" />
            <div>
              <p className="mb-2 text-xs text-fg-subtle">Score bar (hover for interval)</p>
              <ScoreBar stats={sample} showConfidence />
            </div>
            <div>
              <p className="mb-2 text-xs text-fg-subtle">Sentiment split</p>
              <SentimentSplit pos={120} neu={40} neg={60} />
              <p className="mt-3 text-xs text-fg-subtle">Below minimum sample:</p>
              <NotEnoughData n={12} />
            </div>
          </div>
        </Panel>
        <Panel title="Table" bodyClassName="p-0">
          <Table>
            <THead>
              <tr>
                <TH>Competitor</TH>
                <TH numeric>Reviews</TH>
                <TH>Score</TH>
              </tr>
            </THead>
            <TBody>
              {["Alpha", "Beta", "Gamma"].map((n, i) => (
                <TR key={n}>
                  <TD className={stickyCol}>{n}</TD>
                  <TD numeric>{(i + 1) * 1234}</TD>
                  <TD>
                    <ScoreBar stats={scoreStats(60 - i * 15, 20, 20 + i * 15)} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
        <div className="grid gap-6 md:grid-cols-3">
          <Panel title="Loading">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-24 w-full" />
          </Panel>
          <Panel title="Empty">
            <EmptyState title="No competitors tracked yet" description="Add a competitor to start." action={<Button variant="primary">Add competitor</Button>} className="py-4" />
          </Panel>
          <Panel title="Error">
            <ErrorNotice description="Something failed." action={<Button>Try again</Button>} />
          </Panel>
        </div>
      </div>
    </main>
  );
}

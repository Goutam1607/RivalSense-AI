import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/ui/panel";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ThemeToggle } from "@/components/theme";
import { env } from "@/lib/env";
import { fmtDateTime, fmtInt } from "@/lib/format";
import { getContext } from "@/server/context";
import { prisma } from "@/server/db/client";

export const metadata: Metadata = { title: "Settings" };

const PROVIDERS = [
  { key: "none", label: "None (template text)", desc: "Every insight uses deterministic template wording. The app is fully functional." },
  { key: "anthropic", label: "Anthropic (Claude)", desc: "Rewords template text only. Needs ANTHROPIC_API_KEY. Default model claude-opus-5-5 (override with LLM_MODEL)." },
  { key: "openai", label: "OpenAI", desc: "Rewords template text only. Needs OPENAI_API_KEY. Model from LLM_MODEL." },
] as const;

export default async function SettingsPage() {
  const ctx = await getContext();
  const marketIds = ctx.markets.map((m) => m.id);
  const [members, runs, writtenBy, aspects] = await Promise.all([
    prisma.membership.count({ where: { workspaceId: ctx.workspace.id } }),
    prisma.analysisRun.findMany({
      where: { marketId: { in: marketIds }, market: { workspaceId: ctx.workspace.id } },
      include: { market: { select: { name: true } } },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    ctx.market
      ? prisma.insight.groupBy({ by: ["writtenBy"], where: { marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } }, _count: { _all: true } })
      : [],
    ctx.market
      ? prisma.aspectCategory.findMany({ where: { marketId: ctx.market.id, market: { workspaceId: ctx.workspace.id } }, orderBy: { sortOrder: "asc" } })
      : [],
  ]);
  const keyPresent = { none: true, anthropic: Boolean(env.ANTHROPIC_API_KEY), openai: Boolean(env.OPENAI_API_KEY) };
  const latestEval = runs.find((r) => r.evalSummary)?.evalSummary as Record<string, Record<string, number>> | undefined;

  return (
    <>
      <PageHeader title="Settings" description="Workspace, data, AI provider and analysis runs." />
      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Workspace">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-fg-subtle">Name</dt>
              <dd>
                {ctx.workspace.name} {ctx.workspace.isDemo && <Badge tone="warning" casing="normal">Read-only demo</Badge>}
              </dd>
              <dt className="text-fg-subtle">Your role</dt>
              <dd>{ctx.workspace.role === "OWNER" ? "Owner" : "Member"}</dd>
              <dt className="text-fg-subtle">Members</dt>
              <dd className="tabular">{members}</dd>
              <dt className="text-fg-subtle">Markets</dt>
              <dd>{ctx.markets.map((m) => m.name).join(", ") || "—"}</dd>
            </dl>
          </Panel>
          <Panel title="Account & appearance">
            <dl className="grid grid-cols-[8rem_1fr] items-center gap-y-2 text-sm">
              <dt className="text-fg-subtle">Name</dt>
              <dd>{ctx.user.name}</dd>
              <dt className="text-fg-subtle">Email</dt>
              <dd>{ctx.user.email}</dd>
              <dt className="text-fg-subtle">Theme</dt>
              <dd>
                <ThemeToggle />
              </dd>
            </dl>
          </Panel>
        </div>

        <Panel
          title="AI provider"
          description="An optional LLM may reword insight text. It only sees computed facts and its output is rejected if it contains any number not in those facts. Without a key, everything works with template text."
        >
          <fieldset aria-describedby="ai-help">
            <legend className="sr-only">AI provider</legend>
            <div className="grid gap-2 md:grid-cols-3">
              {PROVIDERS.map((p) => {
                const active = env.LLM_PROVIDER === p.key;
                return (
                  <div key={p.key} className={`rounded-md border p-3 ${active ? "border-ring" : "border-border"}`} aria-current={active ? "true" : undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{p.label}</span>
                      {active && <Badge tone="info" casing="normal">Active</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">{p.desc}</p>
                    {p.key !== "none" && (
                      <p className="mt-2 text-xs">
                        API key on server:{" "}
                        <span className={keyPresent[p.key] ? "text-positive" : "text-fg-subtle"}>{keyPresent[p.key] ? "configured" : "not set"}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
          <div id="ai-help" className="mt-4 space-y-2 text-sm text-fg-muted">
            <p>
              Keys are <strong className="text-fg">server-side environment variables</strong> — they are never entered or stored in the browser. The choice applies when the
              pipeline generates insights, so change it and re-run the pipeline:
            </p>
            <pre className="overflow-x-auto rounded-md bg-bg-muted p-3 font-mono text-xs text-fg">
              {`# .env in the repo root (local), or Vercel → Project → Settings → Environment Variables
LLM_PROVIDER="anthropic"          # none | anthropic | openai
ANTHROPIC_API_KEY="sk-ant-..."
# then, from services/pipeline:
python -m pipeline run --provider demo`}
            </pre>
            {writtenBy.length > 0 && (
              <p>
                Current insight wording in {ctx.market?.name}:{" "}
                {writtenBy.map((w) => `${w.writtenBy === "template" ? "template" : w.writtenBy} (${(w._count as { _all: number })._all})`).join(", ")}.
              </p>
            )}
          </div>
        </Panel>

        {ctx.market && (
          <Panel title={`Aspect categories — ${ctx.market.name}`} description="Stored per market (not hard-coded). The pipeline detects them with these seed keywords plus embedding similarity to the description." bodyClassName="p-0">
            <Table>
              <caption className="sr-only">Aspect categories</caption>
              <THead>
                <tr>
                  <TH>Key</TH>
                  <TH>Label</TH>
                  <TH>Description</TH>
                  <TH numeric>Seed keywords</TH>
                </tr>
              </THead>
              <TBody>
                {aspects.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-mono text-xs">{a.key}</TD>
                    <TD className="whitespace-nowrap">{a.label}</TD>
                    <TD className="text-xs text-fg-muted">{a.description}</TD>
                    <TD numeric title={a.seedKeywords.join(", ")}>
                      {a.seedKeywords.length}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Panel>
        )}

        <Panel title="Analysis runs" description="Each run of the Python pipeline. The web app only reads results of successful runs." bodyClassName="p-0">
          <Table>
            <caption className="sr-only">Recent analysis runs</caption>
            <THead>
              <tr>
                <TH>Run</TH>
                <TH>Market</TH>
                <TH>Provider</TH>
                <TH>Status</TH>
                <TH>Started</TH>
                <TH numeric>Duration</TH>
                <TH numeric>Analysed reviews</TH>
                <TH numeric>Insights</TH>
              </tr>
            </THead>
            <TBody>
              {runs.map((r) => {
                const c = (r.counts ?? {}) as Record<string, number>;
                const secs = r.finishedAt ? Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000) : null;
                return (
                  <TR key={r.id}>
                    <TD className="font-mono text-xs">{r.id.slice(0, 8)}</TD>
                    <TD>{r.market.name}</TD>
                    <TD>{r.provider}</TD>
                    <TD>
                      <Badge tone={r.status === "SUCCEEDED" ? "positive" : r.status === "FAILED" ? "negative" : "warning"} casing="normal" title={r.error ?? undefined}>
                        {r.status.toLowerCase()}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">{fmtDateTime(r.startedAt)}</TD>
                    <TD numeric>{secs === null ? "—" : `${Math.floor(secs / 60)}m ${secs % 60}s`}</TD>
                    <TD numeric>{c.analysed ? fmtInt(c.analysed) : "—"}</TD>
                    <TD numeric>{c.insights ?? "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {latestEval && (
            <p className="border-t border-border px-4 py-3 text-xs text-fg-muted">
              Latest evaluation:{" "}
              {latestEval.gold
                ? `gold set (n = ${latestEval.gold.n}) aspect F1 ${latestEval.gold.aspect_micro_f1}, overall sentiment macro-F1 ${latestEval.gold.overall_macro_f1}`
                : "gold set pending"}
              {latestEval.synthetic_sanity ? " · synthetic sanity check stored with each demo run" : ""}. See docs/EVALUATION.md.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}

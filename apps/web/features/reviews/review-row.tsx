"use client";

import { ChevronDown, ChevronRight, Star } from "lucide-react";
import * as React from "react";
import { Badge, SentimentBadge } from "@/components/ui/badge";
import { competitorColor, LANGUAGE_LABEL, SOURCE_LABEL } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReviewListItem, ReviewMention } from "@/server/data/reviews";

const MARK: Record<string, string> = {
  POSITIVE: "bg-positive-bg text-fg underline decoration-positive decoration-2 underline-offset-2",
  NEUTRAL: "bg-bg-muted text-fg underline decoration-fg-subtle decoration-2 underline-offset-2",
  NEGATIVE: "bg-negative-bg text-fg underline decoration-negative decoration-2 underline-offset-2",
};

/** Review text with each detected aspect phrase highlighted (colour + underline + label for assistive tech). */
function Highlighted({ text, mentions }: { text: string; mentions: ReviewMention[] }) {
  const spans = mentions
    .filter((m) => m.matchStart !== null && m.matchEnd !== null && m.matchEnd! <= text.length)
    .sort((a, b) => a.matchStart! - b.matchStart!);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of spans) {
    if (m.matchStart! < cursor) continue;
    out.push(text.slice(cursor, m.matchStart!));
    out.push(
      <mark key={`${m.aspectKey}-${m.matchStart}`} className={cn("rounded-[2px] px-0.5", MARK[m.sentiment])} title={`${m.aspectLabel}: ${m.sentiment.toLowerCase()}`}>
        {text.slice(m.matchStart!, m.matchEnd!)}
        <span className="sr-only"> ({m.aspectLabel}, {m.sentiment.toLowerCase()})</span>
      </mark>,
    );
    cursor = m.matchEnd!;
  }
  out.push(text.slice(cursor));
  return <>{out}</>;
}

export function ReviewRow({ r }: { r: ReviewListItem }) {
  const [open, setOpen] = React.useState(false);
  const analysed = r.status === "ANALYSED";
  const panelId = `review-${r.id}-detail`;
  return (
    <li className="border-b border-border px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
        <span className="inline-flex items-center gap-1.5 font-medium text-fg">
          <span className="size-2 rounded-full" style={{ background: competitorColor(r.color_index) }} aria-hidden />
          {r.competitor}
        </span>
        <span role="img" className="inline-flex items-center gap-0.5 text-fg-muted" aria-label={`${r.rating} out of 5 stars`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={cn("size-3", i < r.rating ? "fill-current text-fg-muted" : "text-border-strong")} aria-hidden />
          ))}
        </span>
        <span className="tabular">{fmtDate(r.reviewed_at)}</span>
        <span>{SOURCE_LABEL[r.source_kind] ?? r.source_kind}</span>
        {r.app_version && <span className="num">v{r.app_version}</span>}
        {r.sentiment && <SentimentBadge value={r.sentiment} />}
        {r.status === "NOT_ANALYSED_LANGUAGE" && <Badge tone="outline" casing="normal">Not yet analysed (language: {LANGUAGE_LABEL[r.language ?? ""] ?? r.language})</Badge>}
        {r.status === "DUPLICATE" && <Badge tone="outline" casing="normal">Duplicate — excluded</Badge>}
        {r.status === "SPAM" && <Badge tone="outline" casing="normal">Spam — excluded</Badge>}
        {r.status === "PENDING" && <Badge tone="outline" casing="normal">Awaiting analysis</Badge>}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-fg">
        <Highlighted text={r.text} mentions={r.mentions} />
      </p>
      {(r.mentions.length > 0 || analysed) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {r.mentions.map((m) => (
            <span key={m.aspectKey} className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-px text-2xs text-fg-muted">
              {m.aspectLabel}
              <SentimentBadge value={m.sentiment} compact className="border-0 bg-transparent px-0" />
            </span>
          ))}
          {analysed && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((o) => !o)}
              className="ml-auto inline-flex items-center gap-1 rounded-sm text-xs text-fg-subtle hover:text-fg"
            >
              {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
              Clause analysis
            </button>
          )}
        </div>
      )}
      {open && (
        <div id={panelId} className="mt-3 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <caption className="sr-only">Clause-level analysis</caption>
            <thead className="bg-bg-subtle text-fg-subtle">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">Clause</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">Clause sentiment</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">Aspects (layer · confidence)</th>
              </tr>
            </thead>
            <tbody>
              {r.clauses.map((c) => {
                const ms = r.mentions.filter((m) => m.clauseId === c.id);
                return (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="px-2 py-1.5 text-fg">{c.text}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {c.sentiment ? (
                        <span className="inline-flex items-center gap-1">
                          <SentimentBadge value={c.sentiment as "POSITIVE"} />
                          <span className="tabular text-fg-subtle">{c.confidence?.toFixed(2)}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {ms.length === 0 ? (
                        <span className="text-fg-subtle">none detected</span>
                      ) : (
                        ms.map((m) => (
                          <div key={m.aspectKey} className="tabular">
                            {m.aspectLabel}: {m.sentiment.toLowerCase()} · {m.layer.toLowerCase()}
                            {m.matchedText && <> (“{m.matchedText}”)</>}
                            {m.similarity !== null && <> · sim {m.similarity.toFixed(2)}</>} · conf {m.confidence.toFixed(2)}
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-border px-2 py-1.5 text-2xs text-fg-subtle">
            Overall review sentiment confidence {r.sentiment_conf?.toFixed(2) ?? "—"}. Aspect sentiment comes from the ABSA model on the sentence around each clause; embedding-only detections use the clause sentiment.
          </p>
        </div>
      )}
    </li>
  );
}

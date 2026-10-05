import { FlaskConical } from "lucide-react";
import { competitorColor, SUGGESTION_LABEL } from "@/lib/constants";
import { REPORT_SECTIONS, type ReportSnapshot, type SectionKey } from "@/lib/report-types";
import { cn } from "@/lib/utils";
import { aspectLabel, competitorName, conclusion, dataStatement, dateLabel, evaluationLines, executiveBullets, pct, r0 } from "./report-content";

function Fn({ n }: { n: number[] }) {
  if (!n.length) return null;
  return (
    <sup className="ml-0.5 text-[0.7em] text-accent">
      {n.map((x, i) => (
        <span key={x}>
          {i > 0 && ","}
          <a href={`#ev-${x}`} aria-label={`Evidence ${x}`}>
            {x}
          </a>
        </span>
      ))}
    </sup>
  );
}

function H({ num, id, children }: { num: number; id: SectionKey; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-12 mb-4 flex items-baseline gap-3 border-b border-border pb-2 text-xl font-semibold tracking-tight break-after-avoid">
      <span className="text-fg-subtle tabular">{num}.</span>
      {children}
    </h2>
  );
}

function T({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_th]:border-b [&_th]:border-border-strong [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-fg-subtle", className)}>{children}</table>
    </div>
  );
}

export function ReportView({ s }: { s: ReportSnapshot }) {
  const has = (k: SectionKey) => s.sections.includes(k);
  const numbered = REPORT_SECTIONS.filter((x) => has(x.key));
  const num = (k: SectionKey) => numbered.findIndex((x) => x.key === k) + 1;
  const obs = s.findings.filter((f) => f.type === "OBSERVATION");
  const sugg = s.findings.filter((f) => f.type === "OPPORTUNITY" || f.type === "RECOMMENDATION");

  return (
    <article className="mx-auto max-w-4xl rounded-lg border border-border bg-bg px-6 py-10 sm:px-12 print:border-0">
      {/* Cover */}
      <header className="border-b border-border pb-10">
        <p className="text-xs font-medium tracking-widest text-fg-subtle uppercase">Competitive intelligence report</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mt-2 text-md text-fg-muted">{s.market.name}</p>
        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-fg-subtle">Period</dt>
            <dd>{dateLabel(s.window.from)} – {dateLabel(s.window.to)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Competitors</dt>
            <dd>{s.competitors.map((c) => c.name).join(", ")}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Generated</dt>
            <dd>{dateLabel(s.generatedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Analysis run</dt>
            <dd className="font-mono text-xs">{s.analysisRunId?.slice(0, 8) ?? "—"}</dd>
          </div>
        </dl>
        <p className={cn("mt-8 flex gap-2 rounded-md border px-3 py-2 text-sm", s.market.dataKind === "DEMO_SYNTHETIC" ? "border-warning-border bg-warning-bg" : "border-border bg-bg-subtle")}>
          {s.market.dataKind === "DEMO_SYNTHETIC" && <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
          {dataStatement(s)}
        </p>
      </header>

      {/* TOC */}
      <nav aria-label="Contents" className="mt-8">
        <h2 className="text-sm font-semibold">Contents</h2>
        <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {numbered.map((x, i) => (
            <li key={x.key}>
              <a href={`#${x.key}`} className="text-fg-muted hover:text-fg hover:underline">
                <span className="mr-2 text-fg-subtle tabular">{i + 1}.</span>
                {x.label}
              </a>
            </li>
          ))}
          <li>
            <a href="#evidence" className="text-fg-muted hover:text-fg hover:underline">
              <span className="mr-2 text-fg-subtle">A.</span>Evidence appendix
            </a>
          </li>
        </ol>
      </nav>

      {has("executive_summary") && (
        <section>
          <H num={num("executive_summary")} id="executive_summary">Executive Summary</H>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            {executiveBullets(s).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      {has("market_overview") && (
        <section>
          <H num={num("market_overview")} id="market_overview">Market Overview</H>
          <p className="mb-3 text-sm text-fg-muted">What customers talk about across the selected competitors: mentions of each aspect, with the sentiment split.</p>
          <T>
            <thead>
              <tr>
                <th>Aspect</th>
                <th className="text-right">Mentions</th>
                <th className="text-right">Positive</th>
                <th className="text-right">Negative</th>
                <th className="text-right">Market score</th>
              </tr>
            </thead>
            <tbody>
              {s.aspects
                .map((a) => {
                  const rows = s.scores.filter((x) => x.aspectKey === a.key);
                  const n = rows.reduce((t, x) => t + x.n, 0);
                  const pos = rows.reduce((t, x) => t + x.pos, 0);
                  const neg = rows.reduce((t, x) => t + x.neg, 0);
                  return { a, n, pos, neg };
                })
                .sort((x, y) => y.n - x.n)
                .map(({ a, n, pos, neg }) => (
                  <tr key={a.key}>
                    <td>{a.label}</td>
                    <td className="text-right tabular">{n.toLocaleString("en-IN")}</td>
                    <td className="text-right tabular">{n ? pct(pos / n, 0) : "—"}</td>
                    <td className="text-right tabular">{n ? pct(neg / n, 0) : "—"}</td>
                    <td className="text-right tabular">{n >= s.methodology.minSample ? r0(50 * (1 + (pos - neg) / n)) : "n/a"}</td>
                  </tr>
                ))}
            </tbody>
          </T>
        </section>
      )}

      {has("competitor_overview") && (
        <section>
          <H num={num("competitor_overview")} id="competitor_overview">Competitor Overview</H>
          <T>
            <thead>
              <tr>
                <th>Competitor</th>
                <th className="text-right">Reviews</th>
                <th className="text-right">Analysed (English)</th>
                <th className="text-right">Other languages</th>
                <th className="text-right">Avg rating</th>
                <th className="text-right">Sentiment index</th>
              </tr>
            </thead>
            <tbody>
              {s.competitors.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="mr-2 inline-block size-2 rounded-full" style={{ background: competitorColor(c.colorIndex) }} />
                    {c.name}
                  </td>
                  <td className="text-right tabular">{c.reviews.toLocaleString("en-IN")}</td>
                  <td className="text-right tabular">{c.analysed.toLocaleString("en-IN")}</td>
                  <td className="text-right tabular">{c.otherLanguage.toLocaleString("en-IN")}</td>
                  <td className="text-right tabular">{c.avgRating ? `${c.avgRating.toFixed(2)} ★` : "—"}</td>
                  <td className="text-right tabular">{r0(c.sentiment.index)}</td>
                </tr>
              ))}
            </tbody>
          </T>
        </section>
      )}

      {has("customer_sentiment") && (
        <section>
          <H num={num("customer_sentiment")} id="customer_sentiment">Customer Sentiment</H>
          <figure className="mb-6">
            <figcaption className="mb-2 text-xs text-fg-subtle">Figure 1. Overall review sentiment per competitor (share of analysed reviews).</figcaption>
            <div className="space-y-2">
              {s.competitors.map((c) => {
                const n = c.sentiment.pos + c.sentiment.neu + c.sentiment.neg;
                return (
                  <div key={c.id} className="grid grid-cols-[8rem_1fr_9rem] items-center gap-3 text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="flex h-3 overflow-hidden rounded-sm bg-bg-muted">
                      <span className="bg-[var(--chart-positive)]" style={{ width: `${n ? (c.sentiment.pos / n) * 100 : 0}%` }} />
                      <span className="bg-[var(--chart-neutral)]" style={{ width: `${n ? (c.sentiment.neu / n) * 100 : 0}%` }} />
                      <span className="bg-[var(--chart-negative)]" style={{ width: `${n ? (c.sentiment.neg / n) * 100 : 0}%` }} />
                    </span>
                    <span className="text-xs text-fg-muted tabular">
                      {n ? `${pct(c.sentiment.pos / n, 0)} pos · ${pct(c.sentiment.neg / n, 0)} neg` : "no data"}
                    </span>
                  </div>
                );
              })}
            </div>
          </figure>
          <p className="mb-2 text-xs text-fg-subtle">Table 1. Aspect scores (0–100; 50 = balanced). “n/a” = fewer than {s.methodology.minSample} mentions.</p>
          <T>
            <thead>
              <tr>
                <th>Aspect</th>
                {s.competitors.map((c) => (
                  <th key={c.id} className="text-right">{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.aspects.map((a) => (
                <tr key={a.key}>
                  <td>{a.label}</td>
                  {s.competitors.map((c) => {
                    const x = s.scores.find((y) => y.competitorId === c.id && y.aspectKey === a.key);
                    return (
                      <td key={c.id} className="text-right tabular" title={x ? `n = ${x.n}, interval ${r0(x.low)}–${r0(x.high)}` : undefined}>
                        {x?.score != null ? r0(x.score) : <span className="text-fg-subtle">n/a ({x?.n ?? 0})</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </T>
        </section>
      )}

      {(has("strengths") || has("weaknesses")) &&
        (["strengths", "weaknesses"] as const)
          .filter((k) => has(k))
          .map((k) => (
            <section key={k}>
              <H num={num(k)} id={k}>{k === "strengths" ? "Strengths" : "Weaknesses"}</H>
              <p className="mb-3 text-sm text-fg-muted">
                {k === "strengths" ? "Highest-scoring aspects per competitor (score ≥ 55, at least 30 mentions)." : "Lowest-scoring aspects per competitor (score < 55, at least 30 mentions)."}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {s.rankings.map((r) => {
                  const list = k === "strengths" ? r.strengths : r.weaknesses;
                  return (
                    <div key={r.competitorId} className="rounded-md border border-border p-3">
                      <h3 className="text-sm font-medium">{competitorName(s, r.competitorId)}</h3>
                      {list.length === 0 ? (
                        <p className="mt-1 text-xs text-fg-subtle">None qualify.</p>
                      ) : (
                        <ol className="mt-1 space-y-0.5 text-sm">
                          {list.map((x) => (
                            <li key={x.aspectKey} className="flex justify-between gap-2">
                              <span>{aspectLabel(s, x.aspectKey)}</span>
                              <span className="text-fg-muted tabular">
                                {r0(x.score)} · n = {x.n}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

      {has("emerging_issues") && (
        <section>
          <H num={num("emerging_issues")} id="emerging_issues">Emerging Issues</H>
          <p className="mb-3 text-sm text-fg-muted">
            Negative mentions of an aspect per analysed review, compared between two periods with a two-proportion z-test. Flagged when ≥ 20 recent negative mentions, ≥ 25% relative increase and p &lt; 0.05 (app-version findings: Benjamini–Hochberg corrected).
          </p>
          {s.emergingIssues.length === 0 ? (
            <p className="text-sm text-fg-subtle">No emerging issues met the rules for the selected competitors.</p>
          ) : (
            <T>
              <thead>
                <tr>
                  <th>Competitor</th>
                  <th>Aspect</th>
                  <th>Comparison</th>
                  <th className="text-right">Before</th>
                  <th className="text-right">After</th>
                  <th className="text-right">z</th>
                  <th className="text-right">p</th>
                </tr>
              </thead>
              <tbody>
                {s.emergingIssues.map((i, k) => (
                  <tr key={k}>
                    <td>{i.competitor}</td>
                    <td>{i.aspect}</td>
                    <td className="text-xs">{i.kind === "APP_VERSION" ? `v${i.appVersion}+ vs earlier` : "last 30 vs previous 30 days"}</td>
                    <td className="text-right tabular">{pct(i.prevShare)} ({i.prevNegative}/{i.prevTotal})</td>
                    <td className="text-right tabular">{pct(i.recentShare)} ({i.recentNegative}/{i.recentTotal})</td>
                    <td className="text-right tabular">{i.z.toFixed(2)}</td>
                    <td className="text-right tabular">{i.p < 0.001 ? "< 0.001" : i.p.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </T>
          )}
        </section>
      )}

      {has("competitive_gaps") && (
        <section>
          <H num={num("competitive_gaps")} id="competitive_gaps">Competitive Gaps</H>
          <p className="mb-3 text-sm text-fg-muted">A gap is a difference of at least 10 points from the median of the other selected competitors, with non-overlapping score intervals.</p>
          {s.gaps.length === 0 ? (
            <p className="text-sm text-fg-subtle">No gaps met the rule.</p>
          ) : (
            <T>
              <thead>
                <tr>
                  <th>Competitor</th>
                  <th>Aspect</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">Median of others</th>
                  <th className="text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {s.gaps.map((g, i) => (
                  <tr key={i}>
                    <td>{competitorName(s, g.competitorId)}</td>
                    <td>{aspectLabel(s, g.aspectKey)}</td>
                    <td className="text-right tabular">{r0(g.score)}</td>
                    <td className="text-right tabular">{r0(g.median)}</td>
                    <td className={cn("text-right font-medium tabular", g.difference > 0 ? "text-positive" : "text-negative")}>
                      {g.difference > 0 ? "+" : "−"}
                      {r0(Math.abs(g.difference))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </T>
          )}
          {s.marketWeaknesses.length > 0 && (
            <p className="mt-4 text-sm">
              <strong>Market-wide weakness:</strong>{" "}
              {s.marketWeaknesses.map((m) => `${aspectLabel(s, m.aspectKey)} (all ${m.competitors} competitors score ${r0(m.min)}–${r0(m.max)})`).join("; ")}.
            </p>
          )}
          {obs.filter((f) => f.title.includes("market") || f.title.includes("weak")).length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {obs
                .filter((f) => f.title.includes("leads") || f.title.includes("trails") || f.title.includes("weak across"))
                .slice(0, 6)
                .map((f, i) => (
                  <li key={i}>
                    {f.text}
                    <Fn n={f.footnotes} />
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {has("opportunities") && (
        <section>
          <H num={num("opportunities")} id="opportunities">Strategic Opportunities</H>
          <p className="mb-4 rounded-md border border-border bg-bg-subtle px-3 py-2 text-xs text-fg-muted">{SUGGESTION_LABEL}. Each item is derived from the computed findings above and links to supporting reviews.</p>
          {sugg.length === 0 ? (
            <p className="text-sm text-fg-subtle">No opportunities were generated for this selection.</p>
          ) : (
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {sugg.slice(0, 10).map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.title}.</span> {f.text}
                  <Fn n={f.footnotes} />
                  <span className="ml-1 text-xs text-fg-subtle">({f.type === "OPPORTUNITY" ? "Opportunity" : "Recommendation"})</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {has("conclusion") && (
        <section>
          <H num={num("conclusion")} id="conclusion">Conclusion</H>
          <p className="text-sm leading-relaxed">{conclusion(s)}</p>
        </section>
      )}

      {has("methodology") && (
        <section>
          <H num={num("methodology")} id="methodology">Sources &amp; Methodology</H>
          <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
            <p>
              <strong className="text-fg">Data.</strong> {dataStatement(s)} Sources: {s.sources.join(", ") || "—"}. Period {dateLabel(s.window.from)} – {dateLabel(s.window.to)}.
            </p>
            <p>
              <strong className="text-fg">Pipeline.</strong> Reviews are cleaned (HTML/control characters removed, duplicates removed by a hash of normalised text, source and date, spam rules), language-detected (non-English and Hinglish reviews are counted but not analysed), split into clauses at contrast words, and tagged with aspects by a keyword lexicon plus sentence-embedding similarity. Aspect sentiment uses a pre-trained aspect-based sentiment model; overall sentiment a pre-trained transformer. Models:{" "}
              {Object.entries(s.methodology.models)
                .filter(([, v]) => v && typeof v === "object" && "name" in (v as object))
                .map(([k, v]) => `${k.replace(/_/g, " ")} — ${(v as { name: string }).name}`)
                .join("; ")}
              .
            </p>
            <p>
              <strong className="text-fg">Metrics.</strong> Aspect score = 50 × (1 + (positive − negative) / mentions), shown only with at least {s.methodology.minSample} mentions. Uncertainty: 95% Wilson intervals for the positive and negative shares; confidence High / Medium / Low for interval widths under 10 / 10–20 / over 20 points. Share of voice = mentions ÷ analysed reviews.
            </p>
            <p>
              <strong className="text-fg">Model evaluation.</strong> {evaluationLines(s).join(" ")}
            </p>
            <p>
              <strong className="text-fg">Limitations.</strong> Only English reviews are analysed; app-store reviewers are not a representative sample of all customers; aspect and sentiment models make mistakes (see evaluation); interpretations and recommendations are suggestions, not facts.
            </p>
            <p className="text-xs">
              Analysis run {s.analysisRunId ?? "—"}
              {s.analysisFinishedAt ? ` (finished ${dateLabel(s.analysisFinishedAt)})` : ""} · report generated {new Date(s.generatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC.
            </p>
          </div>
        </section>
      )}

      <section>
        <h2 id="evidence" className="mt-12 mb-4 border-b border-border pb-2 text-xl font-semibold tracking-tight">A. Evidence appendix</h2>
        {s.evidence.length === 0 ? (
          <p className="text-sm text-fg-subtle">No evidence excerpts.</p>
        ) : (
          <ol className="space-y-1.5 text-xs text-fg-muted">
            {s.evidence.map((e) => (
              <li key={e.n} id={`ev-${e.n}`} className="flex gap-2">
                <span className="w-6 shrink-0 text-right text-fg-subtle tabular">[{e.n}]</span>
                <span>
                  “{e.excerpt}” — {e.competitor}, {e.rating}★, {dateLabel(e.date)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

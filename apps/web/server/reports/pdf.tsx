import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { SUGGESTION_LABEL } from "@/lib/constants";
import { REPORT_SECTIONS, type ReportSnapshot, type SectionKey } from "@/lib/report-types";
import { aspectLabel, competitorName, conclusion, dataStatement, dateLabel, evaluationLines, executiveBullets, pct, r0 } from "@/features/reports/report-content";

/**
 * Server-side PDF with @react-pdf/renderer (ADR 005): pure JavaScript, no headless browser,
 * so it runs inside a Vercel serverless function. Uses the built-in Helvetica (WinAnsi), so
 * text is sanitised to characters that font can draw.
 */
export function pdfText(s: string): string {
  return s
    .replace(/₹\s?/g, "Rs ")
    .replace(/★/g, " stars")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/→/g, "->")
    .replace(/−/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\u0009\u000A\u000D -~ -ÿ–—•…]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const C = { fg: "#18181b", muted: "#52525b", subtle: "#71717a", border: "#e4e4e7", accent: "#1d4ed8", warnBg: "#fefce8", warnBorder: "#fde68a", pos: "#15803d", neg: "#b91c1c" };

const st = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 52, fontFamily: "Helvetica", fontSize: 9.5, color: C.fg, lineHeight: 1.45 },
  footer: { position: "absolute", bottom: 24, left: 52, right: 52, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.subtle },
  kicker: { fontSize: 8, letterSpacing: 1.5, color: C.subtle, textTransform: "uppercase" },
  title: { fontSize: 26, fontFamily: "Helvetica-Bold", marginTop: 10 },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 6 },
  h2: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  p: { marginBottom: 6, color: C.muted },
  small: { fontSize: 8, color: C.subtle },
  bullet: { flexDirection: "row", marginBottom: 4 },
  table: { borderTopWidth: 1, borderTopColor: C.fg, marginTop: 4, marginBottom: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 3 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.subtle },
  note: { borderWidth: 1, borderColor: C.warnBorder, backgroundColor: C.warnBg, padding: 8, marginTop: 24, fontSize: 9 },
  meta: { flexDirection: "row", marginTop: 36, gap: 18 },
});

function Row({ cells, widths, header, aligns }: { cells: string[]; widths: number[]; header?: boolean; aligns?: ("left" | "right")[] }) {
  return (
    <View style={st.tr} wrap={false}>
      {cells.map((c, i) => (
        <Text key={i} style={[{ width: `${widths[i]}%`, textAlign: aligns?.[i] ?? (i === 0 ? "left" : "right"), paddingRight: 4 }, header ? st.th : {}]}>
          {pdfText(c)}
        </Text>
      ))}
    </View>
  );
}

function PdfHeading({ n, children }: { n: number; children: string }) {
  return (
    <Text style={st.h2} minPresenceAhead={140}>
      {n}. {children}
    </Text>
  );
}

function ReportPdf({ s }: { s: ReportSnapshot }) {
  const has = (k: SectionKey) => s.sections.includes(k);
  const numbered = REPORT_SECTIONS.filter((x) => has(x.key));
  const num = (k: SectionKey) => numbered.findIndex((x) => x.key === k) + 1;
  const sugg = s.findings.filter((f) => f.type === "OPPORTUNITY" || f.type === "RECOMMENDATION");
  const fn = (n: number[]) => (n.length ? ` [${n.join(",")}]` : "");
  const footer = (
    <View style={st.footer} fixed>
      <Text>{pdfText(`${s.title} · ${s.market.name}${s.market.dataKind === "DEMO_SYNTHETIC" ? " · Demo dataset — synthetic reviews" : ""}`)}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
  return (
    <Document title={pdfText(s.title)} author="RivalSense" subject={pdfText(s.market.name)}>
      <Page size="A4" style={st.page}>
        <View style={{ marginTop: 120 }}>
          <Text style={st.kicker}>Competitive intelligence report</Text>
          <Text style={st.title}>{pdfText(s.title)}</Text>
          <Text style={st.subtitle}>{pdfText(s.market.name)}</Text>
          <View style={st.meta}>
            {[
              ["Period", `${dateLabel(s.window.from)} – ${dateLabel(s.window.to)}`],
              ["Competitors", s.competitors.map((c) => c.name).join(", ")],
              ["Generated", dateLabel(s.generatedAt)],
              ["Analysis run", s.analysisRunId?.slice(0, 8) ?? "—"],
            ].map(([k, v]) => (
              <View key={k} style={{ width: "25%" }}>
                <Text style={st.small}>{k}</Text>
                <Text>{pdfText(v)}</Text>
              </View>
            ))}
          </View>
          <Text style={st.note}>{pdfText(dataStatement(s))}</Text>
          <Text style={[st.h2, { marginTop: 40 }]}>Contents</Text>
          {numbered.map((x, i) => (
            <Text key={x.key} style={{ marginBottom: 2 }}>
              {i + 1}. {x.label}
            </Text>
          ))}
          <Text>A. Evidence appendix</Text>
        </View>
        {footer}
      </Page>
      <Page size="A4" style={st.page} wrap>
        {has("executive_summary") && (
          <View>
            <PdfHeading n={num("executive_summary")}>Executive Summary</PdfHeading>
            {executiveBullets(s).map((b, i) => (
              <View key={i} style={st.bullet}>
                <Text style={{ width: 10 }}>•</Text>
                <Text style={{ flex: 1 }}>{pdfText(b)}</Text>
              </View>
            ))}
          </View>
        )}
        {has("market_overview") && (
          <View>
            <PdfHeading n={num("market_overview")}>Market Overview</PdfHeading>
            <Text style={st.p}>Mentions of each aspect across the selected competitors, with the sentiment split.</Text>
            <View style={st.table}>
              <Row header cells={["Aspect", "Mentions", "Positive", "Negative", "Market score"]} widths={[36, 16, 16, 16, 16]} />
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
                  <Row key={a.key} cells={[a.label, String(n), n ? pct(pos / n, 0) : "—", n ? pct(neg / n, 0) : "—", n >= s.methodology.minSample ? r0(50 * (1 + (pos - neg) / n)) : "n/a"]} widths={[36, 16, 16, 16, 16]} />
                ))}
            </View>
          </View>
        )}
        {has("competitor_overview") && (
          <View>
            <PdfHeading n={num("competitor_overview")}>Competitor Overview</PdfHeading>
            <View style={st.table}>
              <Row header cells={["Competitor", "Reviews", "Analysed", "Other languages", "Avg rating", "Sentiment index"]} widths={[25, 15, 15, 15, 15, 15]} />
              {s.competitors.map((c) => (
                <Row key={c.id} cells={[c.name, String(c.reviews), String(c.analysed), String(c.otherLanguage), c.avgRating ? c.avgRating.toFixed(2) : "—", r0(c.sentiment.index)]} widths={[25, 15, 15, 15, 15, 15]} />
              ))}
            </View>
          </View>
        )}
        {has("customer_sentiment") && (
          <View>
            <PdfHeading n={num("customer_sentiment")}>Customer Sentiment</PdfHeading>
            <Text style={st.small}>Figure 1. Overall review sentiment (green positive, grey neutral, red negative).</Text>
            {s.competitors.map((c) => {
              const n = c.sentiment.pos + c.sentiment.neu + c.sentiment.neg || 1;
              return (
                <View key={c.id} style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }} wrap={false}>
                  <Text style={{ width: 90 }}>{pdfText(c.name)}</Text>
                  <View style={{ flexDirection: "row", width: 260, height: 8 }}>
                    <View style={{ width: `${(c.sentiment.pos / n) * 100}%`, backgroundColor: "#4d9a5b" }} />
                    <View style={{ width: `${(c.sentiment.neu / n) * 100}%`, backgroundColor: "#a1a1aa" }} />
                    <View style={{ width: `${(c.sentiment.neg / n) * 100}%`, backgroundColor: "#d0605e" }} />
                  </View>
                  <Text style={[st.small, { marginLeft: 8 }]}>
                    {pct(c.sentiment.pos / n, 0)} pos · {pct(c.sentiment.neg / n, 0)} neg
                  </Text>
                </View>
              );
            })}
            <Text style={[st.small, { marginTop: 10 }]}>Table 1. Aspect scores (0–100; n/a = fewer than {s.methodology.minSample} mentions).</Text>
            <View style={st.table}>
              <Row header cells={["Aspect", ...s.competitors.map((c) => c.name)]} widths={[28, ...s.competitors.map(() => 72 / s.competitors.length)]} />
              {s.aspects.map((a) => (
                <Row
                  key={a.key}
                  cells={[a.label, ...s.competitors.map((c) => {
                    const x = s.scores.find((y) => y.competitorId === c.id && y.aspectKey === a.key);
                    return x?.score != null ? r0(x.score) : `n/a (${x?.n ?? 0})`;
                  })]}
                  widths={[28, ...s.competitors.map(() => 72 / s.competitors.length)]}
                />
              ))}
            </View>
          </View>
        )}
        {(["strengths", "weaknesses"] as const)
          .filter((k) => has(k))
          .map((k) => (
            <View key={k}>
              <PdfHeading n={num(k)}>{k === "strengths" ? "Strengths" : "Weaknesses"}</PdfHeading>
              {s.rankings.map((r) => {
                const list = k === "strengths" ? r.strengths : r.weaknesses;
                return (
                  <Text key={r.competitorId} style={{ marginBottom: 3 }}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>{pdfText(competitorName(s, r.competitorId))}: </Text>
                    {list.length ? pdfText(list.map((x) => `${aspectLabel(s, x.aspectKey)} (${r0(x.score)}, n = ${x.n})`).join("; ")) : "none qualify"}
                  </Text>
                );
              })}
            </View>
          ))}
        {has("emerging_issues") && (
          <View>
            <PdfHeading n={num("emerging_issues")}>Emerging Issues</PdfHeading>
            <Text style={st.p}>Negative mentions per analysed review compared between two periods (two-proportion z-test).</Text>
            {s.emergingIssues.length === 0 ? (
              <Text style={st.small}>No emerging issues met the rules.</Text>
            ) : (
              <View style={st.table}>
                <Row header cells={["Competitor / aspect", "Comparison", "Before", "After", "z", "p"]} widths={[28, 24, 14, 14, 8, 12]} />
                {s.emergingIssues.map((i, k) => (
                  <Row key={k} cells={[`${i.competitor} · ${i.aspect}`, i.kind === "APP_VERSION" ? `v${i.appVersion}+ vs earlier` : "last 30 vs prev 30 days", pct(i.prevShare), pct(i.recentShare), i.z.toFixed(2), i.p < 0.001 ? "< 0.001" : i.p.toFixed(3)]} widths={[28, 24, 14, 14, 8, 12]} aligns={["left", "left", "right", "right", "right", "right"]} />
                ))}
              </View>
            )}
          </View>
        )}
        {has("competitive_gaps") && (
          <View>
            <PdfHeading n={num("competitive_gaps")}>Competitive Gaps</PdfHeading>
            <Text style={st.p}>At least 10 points from the median of the other competitors, with non-overlapping score intervals.</Text>
            {s.gaps.length > 0 && (
              <View style={st.table}>
                <Row header cells={["Competitor", "Aspect", "Score", "Median of others", "Difference"]} widths={[24, 28, 14, 18, 16]} aligns={["left", "left", "right", "right", "right"]} />
                {s.gaps.map((g, i) => (
                  <Row key={i} cells={[competitorName(s, g.competitorId), aspectLabel(s, g.aspectKey), r0(g.score), r0(g.median), `${g.difference > 0 ? "+" : "-"}${r0(Math.abs(g.difference))}`]} widths={[24, 28, 14, 18, 16]} aligns={["left", "left", "right", "right", "right"]} />
                ))}
              </View>
            )}
            {s.marketWeaknesses.length > 0 && (
              <Text>
                Market-wide weakness: {pdfText(s.marketWeaknesses.map((m) => `${aspectLabel(s, m.aspectKey)} (all ${m.competitors} competitors score ${r0(m.min)}–${r0(m.max)})`).join("; "))}.
              </Text>
            )}
          </View>
        )}
        {has("opportunities") && (
          <View>
            <PdfHeading n={num("opportunities")}>Strategic Opportunities</PdfHeading>
            <Text style={st.small}>{SUGGESTION_LABEL}.</Text>
            {sugg.slice(0, 10).map((f, i) => (
              <View key={i} style={st.bullet} wrap={false}>
                <Text style={{ width: 14 }}>{i + 1}.</Text>
                <Text style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{pdfText(f.title)}. </Text>
                  {pdfText(f.text)}
                  {fn(f.footnotes)}
                </Text>
              </View>
            ))}
          </View>
        )}
        {has("conclusion") && (
          <View>
            <PdfHeading n={num("conclusion")}>Conclusion</PdfHeading>
            <Text>{pdfText(conclusion(s))}</Text>
          </View>
        )}
        {has("methodology") && (
          <View>
            <PdfHeading n={num("methodology")}>Sources & Methodology</PdfHeading>
            <Text style={st.p}>{pdfText(`Data. ${dataStatement(s)} Sources: ${s.sources.join(", ")}.`)}</Text>
            <Text style={st.p}>
              {pdfText(
                `Pipeline. Cleaning and de-duplication, language detection (non-English counted but not analysed), clause splitting at contrast words, aspect detection by keyword lexicon plus sentence-embedding similarity, aspect sentiment by a pre-trained ABSA model and overall sentiment by a pre-trained transformer. Models: ${Object.entries(s.methodology.models)
                  .filter(([, v]) => v && typeof v === "object" && "name" in (v as object))
                  .map(([k, v]) => `${k.replace(/_/g, " ")} - ${(v as { name: string }).name}`)
                  .join("; ")}.`,
              )}
            </Text>
            <Text style={st.p}>{pdfText(`Metrics. Aspect score = 50 x (1 + (positive - negative) / mentions), shown with at least ${s.methodology.minSample} mentions. 95% Wilson intervals for positive and negative shares; confidence High / Medium / Low for interval widths under 10 / 10-20 / over 20 points.`)}</Text>
            <Text style={st.p}>{pdfText(`Model evaluation. ${evaluationLines(s).join(" ")}`)}</Text>
            <Text style={st.p}>Limitations. Only English reviews are analysed; app-store reviewers are not a representative sample; models make mistakes; interpretations and recommendations are suggestions, not facts.</Text>
            <Text style={st.small}>{pdfText(`Analysis run ${s.analysisRunId ?? "-"} · report generated ${s.generatedAt.replace("T", " ").slice(0, 16)} UTC`)}</Text>
          </View>
        )}
        <View break>
          <Text style={st.h2}>A. Evidence appendix</Text>
          {s.evidence.map((e) => (
            <Text key={e.n} style={{ fontSize: 8, marginBottom: 3, color: C.muted }}>
              [{e.n}] {`"${pdfText(e.excerpt)}"`} — {pdfText(e.competitor)}, {e.rating} stars, {dateLabel(e.date)}
            </Text>
          ))}
        </View>
        {footer}
      </Page>
    </Document>
  );
}

export async function renderReportPdf(s: ReportSnapshot): Promise<Buffer> {
  return renderToBuffer(<ReportPdf s={s} />);
}

/** Frozen report content. Built once on the server; rendered by the web view, the PDF and the share page. */
export const REPORT_SECTIONS = [
  { key: "executive_summary", label: "Executive Summary" },
  { key: "market_overview", label: "Market Overview" },
  { key: "competitor_overview", label: "Competitor Overview" },
  { key: "customer_sentiment", label: "Customer Sentiment" },
  { key: "strengths", label: "Strengths" },
  { key: "weaknesses", label: "Weaknesses" },
  { key: "emerging_issues", label: "Emerging Issues" },
  { key: "competitive_gaps", label: "Competitive Gaps" },
  { key: "opportunities", label: "Strategic Opportunities" },
  { key: "conclusion", label: "Conclusion" },
  { key: "methodology", label: "Sources & Methodology" },
] as const;
export type SectionKey = (typeof REPORT_SECTIONS)[number]["key"];

export type ReportScore = {
  competitorId: string;
  aspectKey: string;
  n: number;
  pos: number;
  neu: number;
  neg: number;
  score: number | null;
  low: number;
  high: number;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
};

export type ReportFinding = {
  type: "OBSERVATION" | "INTERPRETATION" | "OPPORTUNITY" | "RECOMMENDATION";
  title: string;
  text: string;
  competitor: string | null;
  aspect: string | null;
  n: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  footnotes: number[]; // indices into evidence
};

export type ReportEvidence = { n: number; competitor: string; date: string; rating: number; excerpt: string };

export type ReportSnapshot = {
  version: 1;
  title: string;
  market: { name: string; dataKind: "DEMO_SYNTHETIC" | "LIVE" };
  generatedAt: string;
  analysisRunId: string | null;
  analysisFinishedAt: string | null;
  window: { from: string; to: string; label: string };
  sections: SectionKey[];
  sources: string[];
  competitors: {
    id: string;
    name: string;
    colorIndex: number;
    reviews: number;
    analysed: number;
    otherLanguage: number;
    avgRating: number | null;
    sentiment: { pos: number; neu: number; neg: number; index: number | null };
  }[];
  aspects: { key: string; label: string }[];
  scores: ReportScore[];
  rankings: { competitorId: string; strengths: { aspectKey: string; score: number; n: number }[]; weaknesses: { aspectKey: string; score: number; n: number }[] }[];
  gaps: { competitorId: string; aspectKey: string; score: number; median: number; difference: number }[];
  marketWeaknesses: { aspectKey: string; min: number; max: number; competitors: number }[];
  emergingIssues: { competitor: string; aspect: string; kind: string; appVersion: string | null; prevShare: number; recentShare: number; prevNegative: number; prevTotal: number; recentNegative: number; recentTotal: number; z: number; p: number }[];
  findings: ReportFinding[];
  evidence: ReportEvidence[];
  methodology: {
    minSample: number;
    models: Record<string, unknown>;
    counts: Record<string, unknown>;
    evaluation: Record<string, unknown> | null;
  };
};

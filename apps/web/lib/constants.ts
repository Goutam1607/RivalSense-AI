export const DEMO_LABEL = "Demo dataset — synthetic reviews";
export const SUGGESTION_LABEL = "Analytical suggestion — not verified market fact";

export const INSIGHT_TYPES = ["OBSERVATION", "INTERPRETATION", "OPPORTUNITY", "RECOMMENDATION"] as const;
export type InsightTypeKey = (typeof INSIGHT_TYPES)[number];

export const INSIGHT_TYPE_LABEL: Record<InsightTypeKey, string> = {
  OBSERVATION: "Observation",
  INTERPRETATION: "Interpretation",
  OPPORTUNITY: "Opportunity",
  RECOMMENDATION: "Recommendation",
};

export const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
export type SentimentKey = (typeof SENTIMENTS)[number];

export const LANGUAGE_LABEL: Record<string, string> = {
  en: "English",
  hinglish: "Hinglish",
  hi: "Hindi",
  und: "Undetermined",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  es: "Spanish",
  fr: "French",
  de: "German",
  id: "Indonesian",
};

export const SOURCE_LABEL: Record<string, string> = {
  DEMO: "Demo (synthetic)",
  CSV: "CSV import",
  GOOGLE_PLAY: "Google Play",
};

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
export const competitorColor = (i: number) =>
  CHART_COLORS[((i % CHART_COLORS.length) + CHART_COLORS.length) % CHART_COLORS.length];

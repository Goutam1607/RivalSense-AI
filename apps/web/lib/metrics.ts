/**
 * Metric formulas from CLAUDE.md §5 — mirrors services/pipeline/pipeline/metrics.py.
 * Both implementations are unit-tested against the same hand-calculated values.
 */
export const MIN_SAMPLE = 30;
const Z95 = 1.959963984540054;

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

/** score = 50 × (1 + (pos − neg) / (pos + neu + neg)) — 100 all positive, 50 balanced, 0 all negative. */
export function aspectScore(pos: number, neu: number, neg: number): number | null {
  const n = pos + neu + neg;
  if (n === 0) return null;
  return 50 * (1 + (pos - neg) / n);
}

/** 95% Wilson score interval for a proportion, as fractions in [0, 1]. */
export function wilson(successes: number, n: number, z = Z95): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** High / Medium / Low from interval width in percentage points (< 10 / 10–20 / > 20). */
export function confidenceLabel(widthPoints: number): Confidence {
  if (widthPoints < 10) return "HIGH";
  if (widthPoints <= 20) return "MEDIUM";
  return "LOW";
}

export type ScoreStats = {
  pos: number;
  neu: number;
  neg: number;
  n: number;
  score: number | null;
  posInterval: [number, number];
  negInterval: [number, number];
  scoreInterval: [number, number];
  confidence: Confidence | null;
  enoughData: boolean;
};

export function scoreStats(pos: number, neu: number, neg: number, minSample = MIN_SAMPLE): ScoreStats {
  const n = pos + neu + neg;
  const posInterval = wilson(pos, n);
  const negInterval = wilson(neg, n);
  const enoughData = n >= minSample;
  const width = Math.max(posInterval[1] - posInterval[0], negInterval[1] - negInterval[0]) * 100;
  return {
    pos,
    neu,
    neg,
    n,
    score: enoughData ? aspectScore(pos, neu, neg) : null,
    posInterval,
    negInterval,
    // conservative score interval built from the two Wilson intervals (see docs/METRICS.md)
    scoreInterval: [50 * (1 + posInterval[0] - negInterval[1]), 50 * (1 + posInterval[1] - negInterval[0])],
    confidence: enoughData ? confidenceLabel(width) : null,
    enoughData,
  };
}

export function shareOfVoice(mentions: number, reviews: number): number {
  return reviews ? mentions / reviews : 0;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

export type Gap = { difference: number; median: number; medianInterval: [number, number]; isGap: boolean };

/** §5 competitive gap vs the median of the other competitors with enough data. */
export function competitiveGap(target: ScoreStats, others: ScoreStats[], minPoints = 10): Gap | null {
  const valid = others.filter((o) => o.enoughData && o.score !== null);
  if (target.score === null || valid.length === 0) return null;
  const med = median(valid.map((o) => o.score as number));
  const medianInterval: [number, number] = [
    median(valid.map((o) => o.scoreInterval[0])),
    median(valid.map((o) => o.scoreInterval[1])),
  ];
  const difference = target.score - med;
  return {
    difference,
    median: med,
    medianInterval,
    isGap: Math.abs(difference) >= minPoints && !intervalsOverlap(target.scoreInterval, medianInterval),
  };
}

/** §5 market-wide weakness: every competitor with enough data scores below 55 (needs ≥ 2). */
export function isMarketWideWeakness(scores: (number | null)[], threshold = 55): boolean {
  const valid = scores.filter((s): s is number => s !== null);
  return valid.length >= 2 && valid.every((s) => s < threshold);
}

/** §5 ranking: by score desc, ties by mention volume desc; only enough-data aspects. */
export function rankAspects<K extends string>(stats: Record<K, ScoreStats>): [K, ScoreStats][] {
  return (Object.entries(stats) as [K, ScoreStats][])
    .filter(([, s]) => s.enoughData && s.score !== null)
    .sort((a, b) => (b[1].score as number) - (a[1].score as number) || b[1].n - a[1].n);
}

/** Two-proportion z-test (pooled), two-sided p-value — used for display checks and tests. */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): { z: number; p: number } {
  if (!n1 || !n2) return { z: 0, p: 1 };
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, p: 1 };
  const z = (p1 - p2) / se;
  return { z, p: erfc(Math.abs(z) / Math.SQRT2) };
}

// Complementary error function (Numerical Recipes erfcc, |error| < 1.2e-7)
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Overall sentiment index on the same 0–100 scale as aspect scores. */
export function sentimentIndex(pos: number, neu: number, neg: number): number | null {
  return aspectScore(pos, neu, neg);
}

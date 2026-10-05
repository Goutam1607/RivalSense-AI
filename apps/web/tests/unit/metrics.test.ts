import { describe, expect, it } from "vitest";
import {
  aspectScore,
  competitiveGap,
  confidenceLabel,
  isMarketWideWeakness,
  rankAspects,
  scoreStats,
  twoProportionZ,
  wilson,
} from "@/lib/metrics";

// Same hand-calculated values as services/pipeline/tests/test_metrics.py
describe("metric formulas (CLAUDE.md §5)", () => {
  it("aspect score", () => {
    expect(aspectScore(6, 2, 2)).toBeCloseTo(70);
    expect(aspectScore(10, 0, 0)).toBe(100);
    expect(aspectScore(0, 0, 10)).toBe(0);
    expect(aspectScore(0, 0, 0)).toBeNull();
  });

  it("Wilson interval", () => {
    const [lo, hi] = wilson(8, 10);
    expect(lo).toBeCloseTo(0.4902, 3);
    expect(hi).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 10)[0]).toBe(0);
    expect(wilson(0, 10)[1]).toBeCloseTo(0.2775, 3);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });

  it("confidence labels", () => {
    expect(confidenceLabel(9.99)).toBe("HIGH");
    expect(confidenceLabel(10)).toBe("MEDIUM");
    expect(confidenceLabel(20)).toBe("MEDIUM");
    expect(confidenceLabel(20.01)).toBe("LOW");
  });

  it("minimum sample of 30 mentions", () => {
    const small = scoreStats(20, 5, 4);
    expect(small.enoughData).toBe(false);
    expect(small.score).toBeNull();
    const ok = scoreStats(20, 6, 4);
    expect(ok.score).toBeCloseTo(50 * (1 + 16 / 30));
  });

  it("two-proportion z-test", () => {
    const { z, p } = twoProportionZ(30, 100, 15, 100);
    expect(z).toBeCloseTo(2.54, 2);
    expect(p).toBeCloseTo(0.0111, 3);
  });

  it("competitive gap needs ≥ 10 points AND non-overlapping intervals", () => {
    const strong = scoreStats(90, 5, 5);
    const others = [scoreStats(40, 20, 40), scoreStats(45, 10, 45), scoreStats(35, 30, 35)];
    const g = competitiveGap(strong, others)!;
    expect(g.median).toBeCloseTo(50);
    expect(g.difference).toBeCloseTo(42.5);
    expect(g.isGap).toBe(true);
    const g2 = competitiveGap(scoreStats(20, 5, 7), [scoreStats(15, 5, 12)])!;
    expect(Math.abs(g2.difference)).toBeGreaterThanOrEqual(10);
    expect(g2.isGap).toBe(false);
    expect(competitiveGap(scoreStats(5, 0, 0), others)).toBeNull();
  });

  it("market-wide weakness", () => {
    expect(isMarketWideWeakness([30, 40, 54.9])).toBe(true);
    expect(isMarketWideWeakness([30, 40, 55])).toBe(false);
    expect(isMarketWideWeakness([30, null])).toBe(false);
  });

  it("ranking breaks ties by volume", () => {
    const ranked = rankAspects({ a: scoreStats(30, 0, 30), b: scoreStats(60, 0, 60), c: scoreStats(50, 10, 0), d: scoreStats(5, 0, 0) });
    expect(ranked.map(([k]) => k)).toEqual(["c", "b", "a"]);
  });
});

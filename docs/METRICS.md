# Metrics

Every formula below is implemented twice — `services/pipeline/pipeline/metrics.py` (pipeline) and
`apps/web/lib/metrics.ts` (date-range queries in the app) — and both are unit-tested against the same
hand-calculated values. Definitions follow CLAUDE.md §5; refinements are listed at the end.

## Aspect mention
One (review, aspect) pair with a sentiment (positive / neutral / negative) and a model confidence. If a review mentions
the same aspect in several clauses, the most confident reading is kept.

## Aspect score (0–100)
`score = 50 × (1 + (pos − neg) / (pos + neu + neg))`

*Worked example:* 6 positive, 2 neutral, 2 negative → 50 × (1 + 4/10) = **70**. All positive → 100, balanced → 50,
all negative → 0.

## Minimum sample
A score is shown only when mentions ≥ **30**; otherwise the UI shows “Not enough data (n = X)”.

## Uncertainty: 95% Wilson interval
For a share p̂ = x/n with z = 1.96:
`centre = (p̂ + z²/2n) / (1 + z²/n)`, `half = z·√(p̂(1−p̂)/n + z²/4n²) / (1 + z²/n)`.

*Worked example:* 8 positive of 10 → p̂ = 0.8, denominator 1.384, centre 0.717, half 0.227 → **[0.49, 0.94]**.
Unlike p̂ ± 1.96·√(p̂(1−p̂)/n), Wilson never leaves [0, 1] and behaves sensibly for small n or shares near 0 or 1.

Wilson intervals are computed for the positive share and the negative share. The **score interval** shown in the UI
is the conservative combination `[50(1 + pos_low − neg_high), 50(1 + pos_high − neg_low)]`.

**Confidence label** from the wider of the two share intervals, in percentage points: **High** < 10, **Medium**
10–20, **Low** > 20. (n = 400 at p̂ ≈ 0.5 → ~9.8 points → High; n = 100 → ~19 → Medium; n = 30 → ~33 → Low.)

## Share of voice
`mentions of the aspect ÷ analysed reviews of the competitor in the period`. Example: 120 delivery mentions in 480
analysed reviews → 25%.

## Emerging issue (time window)
Negative-mention share = negative mentions of the aspect ÷ analysed reviews of the competitor in a window. Compare the
most recent 30 days (ending at the latest review in the market) with the previous 30 days. Flag when **all** hold:
1. ≥ 20 negative mentions in the recent window,
2. relative increase (recent share ÷ previous share − 1) ≥ 25%,
3. two-proportion z-test p < 0.05 (two-sided, pooled).

`p̄ = (x₁ + x₂)/(n₁ + n₂)`, `z = (p₁ − p₂) / √(p̄(1−p̄)(1/n₁ + 1/n₂))`.

*Worked example:* 30 of 100 recent vs 15 of 100 previous → p̄ = 0.225, SE = 0.0591, **z = 2.54, p = 0.011**,
relative increase 100%, 30 ≥ 20 → flagged. The statistic and p-value are stored on `emerging_issue`.

## Competitive gap
For an aspect: a competitor's score minus the **median** score of the other competitors that have enough data. Flag
when |difference| ≥ 10 points **and** the competitor's score interval does not overlap the median interval (median of
the others' lower bounds, median of their upper bounds).

*Worked example:* 90/5/5 → score 92.5 (interval ≈ 87–97); three rivals at 50 → median 50 → +42.5, no overlap → gap.

## Market-wide weakness
An aspect where **every** competitor with enough data scores below 55 (at least two such competitors).

## Strength / weakness ranking
Rank a competitor's aspects with enough data by score (descending); ties broken by mention volume. In generated
insights, the top aspect is reported as a strength only if its score ≥ 60 and the bottom one as a weakness only if
its score < 50, so a mediocre aspect is never called a strength.

## Overall sentiment index
The same 0–100 formula applied to review-level sentiment labels.

## Refinements (documented, not silent)

| Rule | Why |
|---|---|
| **App-version drop** (extension): negative-mention share on versions ≥ V vs < V, the best V per competitor × aspect, Benjamini–Hochberg FDR 5% across all version tests, ≥ 20 negative mentions and ≥ 50% relative increase. | Many versions × aspects × competitors means hundreds of tests; without FDR control several would be false alarms. |
| **Dedupe** skips texts shorter than 20 normalised characters. | On real data, hundreds of people write “good” or “nice app” on the same day; treating them as duplicates removed a third of real reviews. |
| **Insight window** for gaps, rankings and market weaknesses = last 180 days. | Enough mentions for intervals while staying recent; the UI recomputes everything for any range the user picks. |
| **Charts per period**: periods with < 10 reviews (trends) or < 30 (dashboard index) are left blank. | Avoids plotting noise from tiny samples. |
| **Overall sentiment model input** truncated at 160 tokens; ABSA input is the sentence around a clause (128 tokens). | CPU speed; app reviews are short. |

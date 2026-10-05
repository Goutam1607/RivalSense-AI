# Demo dataset (synthetic)

`python -m pipeline generate-demo` (also called automatically by `npm run seed`) writes a deterministic synthetic
dataset to `services/pipeline/data/generated/`:

* `demo_reviews.jsonl` — what gets loaded into the database (text, rating, date, app version, competitor),
* `demo_ground_truth.jsonl` — hidden labels (language, aspects + sentiment, overall sentiment, duplicate/spam flags),
  used only by tests and the synthetic sanity check; never shown in the UI.

Seed `20261005`, data ends **30 Sep 2026**; same seed + end date → byte-identical output (tested).

## Market
“Quick Commerce (Demo)” with four **fictional** apps — **Dashly, Kwikr, Basketo, MinuteMart** — so the app never
shows invented complaints about real companies.

## Shape
* ≈ 6,450 reviews over 12 months, volume growing over time, weekends busier.
* Ratings 1–5 derived from the aspects' sentiment with noise, plus ~3% rating/text mismatches.
* Length from one word (“Nice”) to multi-sentence paragraphs; typos, chat-speak (“u”, “pls”), ALL CAPS rants, emojis.
* ~8% Hinglish (romanised Hindi) and Devanagari reviews; ~2% duplicates (exact or case/punctuation variants);
  ~1% spam (referral codes, links, phone numbers, repeated words).
* Built from ~300 phrase templates with slot filling (items, minutes, amounts, days, brand) and random connectors;
  some phrases avoid the lexicon's keywords on purpose so the embedding layer has paraphrases to find.

## Planted signals (later stages must detect them)

| # | Signal | How it is planted | Expected detection | Status |
|---|---|---|---|---|
| 1 | **Kwikr — refunds & returns complaints rise steadily over the last 3 months** | Over the final 90 days the refund mention rate ramps from 6% to 60% of reviews and negativity from 45% to 95% (accelerating), and Kwikr's review volume grows up to +60% | Emerging issue (TIME_WINDOW) for Kwikr × refunds_returns | ✅ 8.1% → 17.9%, z = 2.74, p = 0.006 |
| 2 | **Basketo is clearly best at product availability** | 84% positive / 7% negative vs ~40/45 for the others | Competitive gap, Basketo leads on product_availability | ✅ |
| 3 | **Customer support is weak for everyone** | 17–28% positive, 58–70% negative for all four | Market-wide weakness: customer_support (only) | ✅ |
| 4 | **MinuteMart app experience collapses from app version 5.2.0** | Reviews on versions ≥ 5.2.0 mention the app 32% of the time, 82% negatively (before: 12%, 16%) | APP_VERSION finding for MinuteMart × app_experience at v5.2.0 | ✅ 1.8% → 21.7%, z = 10.9 |
| 5 | Off-taxonomy complaint themes: rider behaviour, serviceability, plastic packaging | 1–5% of reviews per app | Topic discovery lists them as uncategorised themes | ✅ |

`services/pipeline/tests/test_db_and_signals.py` asserts signals 1–4 after a demo run, and that nothing obviously
false is flagged: the only time-window issue is Kwikr × refunds, the only market-wide weakness is customer support.

**Known, expected side effect:** Kwikr v12.5.0 was released 55 days before the end, in the middle of the refund
ramp, so the version test also reports “refunds worse on ≥ 12.5.0”. That is a true pattern in the data (a time trend
looks like a version effect) and a good interview example of confounding.

**Secondary designed differences** that also (correctly) appear as gaps: Dashly leads on delivery speed, Kwikr on
pricing and discounts, Basketo on refunds; Basketo trails on delivery speed.

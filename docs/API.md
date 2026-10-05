# HTTP API

All endpoints are Next.js route handlers in `apps/web/app/api`. Unless noted, they require a signed-in session
(Better Auth cookie) and operate on the caller's **active workspace and market** (top-bar switcher). Every query goes
through the workspace-scoped data-access layer in `apps/web/server`.

**Errors** are JSON: `{ "error": { "code": "...", "message": "...", "details"?: ... } }`

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Not a member of the workspace |
| `READ_ONLY` | 403 | Write attempted in the demo workspace |
| `NOT_FOUND` | 404 | Not found in your workspace (other workspaces' IDs also return this) |
| `VALIDATION` | 400 | Invalid parameters (`details` lists the issues) |
| `RATE_LIMITED` | 429 | Too many requests (auth routes, report generation) |
| `INTERNAL` | 500 | Unexpected error (no stack trace is returned) |

Date windows (`range`) are `7d`, `30d`, `90d`, `6m`, `1y`, `all`, ending at the latest review in the market.

---

### `GET /api/health`
Public. `{ "status": "ok", "database": "ok" }` or 503 `{ "status": "degraded", "database": "unreachable" }`.

### `GET /api/v1/dashboard?range=6m`
Competitive overview of the active market.
```json
{
  "market": { "id": "…", "name": "Quick Commerce (Demo)", "slug": "quick-commerce-demo", "dataKind": "DEMO_SYNTHETIC" },
  "window": { "from": "…", "to": "…", "label": "Last 6 months" },
  "analysisRun": { "id": "…", "finishedAt": "…" },
  "health": [{ "competitor": "Dashly", "slug": "dashly", "reviews": 976, "analysed": 891, "avgRating": 3.3, "sentimentIndex": 58.1,
               "topStrength": { "key": "delivery_speed", "label": "Delivery speed", "score": 80.2, "n": 312 }, "topWeakness": { … } }],
  "drivers": [{ "aspect": "delivery_speed", "label": "Delivery speed", "mentions": 772, "positive": 455, "neutral": 147, "negative": 170, "shareOfVoice": 0.249 }],
  "emergingIssues": [{ "competitor": "kwikr", "aspect": "refunds_returns", "kind": "TIME_WINDOW", "appVersion": null,
                       "prevShare": 0.081, "recentShare": 0.179, "zStatistic": 2.74, "pValue": 0.006 }]
}
```
`sentimentIndex` / `score` are `null` when there are fewer than 30 analysed reviews / mentions.

### `GET /api/v1/competitors`
`{ "competitors": [{ "id", "name", "slug", "status", "reviews", "analysed", "pending", "latestReview", "dataSources": [{ "kind", "label", "externalId", "lastCollectedAt" }] }] }`

### `GET /api/v1/reviews`
Same filters as the review explorer; cursor pagination, 25 per page, newest first.

| Param | Values |
|---|---|
| `competitor` | competitor slug |
| `sentiment` | `POSITIVE` \| `NEUTRAL` \| `NEGATIVE` (overall) |
| `aspect`, `aspectSentiment` | aspect key, sentiment of that aspect |
| `rating` | `1`–`5` or comma list (`1,2`) |
| `from`, `to` | `YYYY-MM-DD` |
| `source` | `DEMO` \| `CSV` \| `GOOGLE_PLAY` |
| `language` | e.g. `en`, `hinglish`, `hi` |
| `status` | `analysed` \| `not_analysed` \| `hidden` (duplicates & spam) \| `all` (default excludes duplicates/spam) |
| `q` | full-text search (Postgres `websearch_to_tsquery`: `"exact phrase"`, `-exclude`) |
| `insight`, `topic` | UUID — only reviews that are evidence for that insight / members of that theme |
| `version`, `minVersion` | exact app version / versions ≥ (`5.2.0`) |
| `cursor` | opaque value from `nextCursor` |

Invalid values are ignored rather than rejected. Response:
`{ "total": 63, "nextCursor": "…" | null, "items": [{ "id", "competitor", "rating", "reviewedAt", "appVersion", "language", "status", "source", "sentiment", "text", "aspects": [{ "aspect", "sentiment", "confidence", "layer", "matchStart", "matchEnd" }] }] }`

### `GET /api/v1/reviews/export?…filters`
CSV of the current filtered set, streamed, capped at 10,000 rows, workspace-scoped. Columns: `reviewed_at, competitor,
rating, source, app_version, language, status, overall_sentiment, aspects, text`. Demo exports start with a
`# Demo dataset — synthetic reviews` line. Cells are quoted and protected against spreadsheet formula injection.

### `GET /api/v1/insights?type=&competitor=&aspect=&confidence=`
`{ "insights": [{ "id", "type", "kind", "title", "text", "writtenBy", "competitor", "aspect", "sampleSize", "dateFrom", "dateTo", "sources", "confidence", "impact", "evidenceCount", "suggestion" }] }`
`suggestion: true` for INTERPRETATION / OPPORTUNITY / RECOMMENDATION (“Analytical suggestion — not verified market fact”).

### `GET /api/v1/trends?range=90d&competitor=slug`
`{ "window": { …, "grain": "week" }, "sentiment": [{ "competitor", "period", "positive", "neutral", "negative" }], "complaints": { "competitor", "analysedReviews": [{ "period", "n" }], "negativeMentions": [{ "period", "aspect", "n" }] } }`

### `GET /api/v1/reports/:id/pdf`
PDF of a saved report (workspace member), or public with `?token=<share token>` while the link is valid.

### `GET /api/v1/reports/:id/csv`
CSV of the aspect aggregates frozen in the report.

### `GET|POST /api/auth/*`
Better Auth endpoints (`/sign-up/email`, `/sign-in/email`, `/sign-out`, `/get-session`, social sign-in). Rate-limited
(sign-in 10/min, sign-up 5/min per IP, 100/min otherwise), CSRF-protected by origin checks.

## Server actions (form posts from the UI)
Validated with zod and scoped the same way: `addCompetitor`, `updateCompetitor`, `setCompetitorArchived` (blocked in the
demo workspace), `createReport` (10 per user per hour; private to the creator in the demo workspace), `createShareLink`,
`revokeShareLink`, `switchWorkspace`, `switchMarket`, `enterDemo`.

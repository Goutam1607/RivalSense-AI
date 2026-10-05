# 005 — Server-side PDF with @react-pdf/renderer

**Context.** Reports must download as a professional PDF, generated on the server, and must work when deployed on
Vercel serverless functions.

**Options.** Headless Chromium (Puppeteer/Playwright) — pixel-perfect HTML, but a 50–100 MB browser in a serverless
function, cold starts of several seconds and size limits; external PDF API — data leaves our system, cost;
**@react-pdf/renderer** — pure JavaScript PDF layout from React components.

**Decision.** `@react-pdf/renderer` (`apps/web/server/reports/pdf.tsx`), rendering the same frozen snapshot as the HTML
report. Built-in Helvetica with a text sanitiser (₹ → “Rs”, ★ → “stars”, emoji removed) so no font files or network
fetches are needed.

**Consequences.** Small, fast, deployable. The PDF layout is a second implementation of the report view (kept in sync
through shared helpers in `features/reports/report-content.ts`); charts are drawn as simple bars rather than copied
from Recharts.

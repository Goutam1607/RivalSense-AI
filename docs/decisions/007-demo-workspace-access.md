# 007 — What visitors can do in the demo workspace

**Context.** “Explore demo” logs everyone into one shared, read-only demo workspace. Stage 12 still requires
generating a PDF report for the demo market.

**Decision.** Data changes (competitors, sources) are blocked in the demo workspace with a visible reason. Reports are
allowed because they only *read* data, but in the demo workspace they are private to their creator, and generation is
limited to 10 per user per hour. New sign-ups also get read-only demo membership so they can compare their market with
the demo.

**Consequences.** Visitors can try the full report → PDF → share-link flow without an account. Visitors using the shared
demo login can see reports other demo visitors made with that same login (acceptable: demo data is synthetic).

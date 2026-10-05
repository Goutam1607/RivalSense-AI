"""GooglePlayProvider — public Google Play reviews via the `google-play-scraper` library.

Polite by design (CLAUDE.md §4):
* small volume cap (default 2,000 reviews per app, configurable),
* a delay between requests (default 2 s) and retries with exponential backoff,
* no CAPTCHA bypassing, proxies or evasion — if Google blocks requests we stop,
* only the fields analysis needs are kept: text, rating, date, app version.
  Reviewer names, avatars, user IDs and developer replies are discarded on read.
  The platform review ID is hashed one-way (external_key) only to avoid storing duplicates.

You are responsible for checking Google Play's terms of service before collecting.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Iterator

from pipeline.config import market_config
from pipeline.providers.base import CompetitorSpec, RawReview, hash_key

log = logging.getLogger("pipeline.google_play")
SOURCE_LABEL = "Google Play (public reviews)"


class GooglePlayProvider:
    name = "google_play"
    market_kind = "LIVE"

    def __init__(self, cap: int = 2000, delay: float = 2.0, lang: str = "en", country: str = "in",
                 max_retries: int = 4):
        cfg = market_config()["live"]
        self.market_slug = cfg["market"]["slug"]
        self.market_name = cfg["market"]["name"]
        self.market_description = cfg["market"]["description"]
        self._apps = cfg["competitors"]
        self.cap, self.delay, self.lang, self.country, self.max_retries = cap, delay, lang, country, max_retries

    def competitors(self) -> list[CompetitorSpec]:
        return [CompetitorSpec(a["slug"], a["name"], a.get("note"), "GOOGLE_PLAY", SOURCE_LABEL, a["googlePlayId"])
                for a in self._apps]

    def _fetch_page(self, app_id: str, token, count: int):
        from google_play_scraper import Sort, reviews

        for attempt in range(self.max_retries + 1):
            try:
                return reviews(app_id, lang=self.lang, country=self.country, sort=Sort.NEWEST, count=count,
                               continuation_token=token)
            except Exception as e:  # network hiccups / temporary blocks
                if attempt == self.max_retries:
                    raise
                wait = self.delay * (2 ** (attempt + 1))
                log.warning("Request for %s failed (%s); retrying in %.0fs", app_id, type(e).__name__, wait)
                time.sleep(wait)
        raise RuntimeError("unreachable")

    def iter_reviews(self, competitor: str | None = None) -> Iterator[RawReview]:
        for app in self._apps:
            if competitor and app["slug"] != competitor:
                continue
            app_id = app["googlePlayId"]
            collected, token = 0, None
            log.info("Collecting up to %d reviews for %s (%s)", self.cap, app["name"], app_id)
            while collected < self.cap:
                page, token = self._fetch_page(app_id, token, min(200, self.cap - collected))
                if not page:
                    break
                now = datetime.now(timezone.utc)
                for r in page:
                    text = (r.get("content") or "").strip()
                    if not text:
                        continue
                    at = r["at"]
                    if at.tzinfo is None:
                        at = at.replace(tzinfo=timezone.utc)
                    yield RawReview(
                        competitor_slug=app["slug"],
                        external_key=hash_key("google_play", app_id, str(r["reviewId"])),
                        text=text,
                        rating=int(r["score"]),
                        reviewed_at=at,
                        app_version=r.get("reviewCreatedVersion") or r.get("appVersion"),
                        collected_at=now,
                    )
                    collected += 1
                    if collected >= self.cap:
                        break
                if token is None or getattr(token, "token", None) is None:
                    break
                time.sleep(self.delay)
            log.info("Collected %d reviews for %s", collected, app["name"])


def collect_to_db(cap: int = 2000, competitor: str | None = None, workspace_slug: str = "demo", delay: float = 2.0) -> int:
    """`python -m pipeline collect` — collection only, no analysis."""
    from pipeline.db import connect
    from pipeline.providers.base import ingest
    from pipeline.run import setup_logging

    setup_logging()
    provider = GooglePlayProvider(cap=cap, delay=delay)
    aspects = market_config()["aspects"]
    with connect() as conn:
        market_id, seen, inserted = ingest(conn, provider, workspace_slug, aspects, provider.market_description, competitor)
        conn.commit()
    log.info("Google Play: %d reviews read, %d new rows stored in market %s", seen, inserted, provider.market_slug)
    print(f"Collected {seen} reviews ({inserted} new). Next: python -m pipeline run --provider google_play")
    return 0

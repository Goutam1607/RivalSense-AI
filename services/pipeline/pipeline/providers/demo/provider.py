"""DemoProvider — reads the synthetic dataset written by generator.py (generating it if missing)."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Iterator

from pipeline.config import GENERATED_DIR, market_config
from pipeline.providers.base import CompetitorSpec, RawReview


class DemoProvider:
    name = "demo"
    market_kind = "DEMO_SYNTHETIC"

    def __init__(self):
        cfg = market_config()["demo"]
        self.market_slug = cfg["market"]["slug"]
        self.market_name = cfg["market"]["name"]
        self.market_description = cfg["market"]["description"]
        self._competitors = cfg["competitors"]
        self.path = GENERATED_DIR / "demo_reviews.jsonl"

    def competitors(self) -> list[CompetitorSpec]:
        return [CompetitorSpec(c["slug"], c["name"], c.get("description")) for c in self._competitors]

    def iter_reviews(self, competitor: str | None = None) -> Iterator[RawReview]:
        if not self.path.exists():
            from pipeline.providers.demo.generator import write

            write(GENERATED_DIR)
        with self.path.open(encoding="utf-8") as f:
            for line in f:
                r = json.loads(line)
                if competitor and r["competitor"] != competitor:
                    continue
                yield RawReview(
                    competitor_slug=r["competitor"],
                    external_key=r["external_key"],
                    text=r["text"],
                    rating=int(r["rating"]),
                    reviewed_at=datetime.fromisoformat(r["reviewed_at"].replace("Z", "+00:00")),
                    app_version=r.get("app_version"),
                )

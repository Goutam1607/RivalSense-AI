"""CsvProvider — import any CSV of reviews with a documented column mapping.

This is how public review datasets (e.g. from Kaggle) get into RivalSense. Usage:

    python -m pipeline run --provider csv --csv reviews.csv --market my-market \
        --mapping '{"competitor": "app_name", "text": "content", "rating": "score", "date": "at"}'

Mapping keys (CSV column names on the right):
    competitor   column with the competitor/app name          (required unless --competitor is given)
    text         review text                                 (required)
    rating       1–5 star rating                             (required)
    date         review date, ISO 8601 or YYYY-MM-DD          (required)
    app_version  app version string                          (optional)
    id           a stable per-row id used only for dedupe — it is hashed, never stored raw (optional)

Columns not listed are ignored — in particular reviewer names or user IDs are never read.
"""

from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from pipeline.providers.base import CompetitorSpec, RawReview, hash_key

DEFAULT_MAPPING = {"competitor": "competitor", "text": "text", "rating": "rating", "date": "date",
                   "app_version": "app_version", "id": "id"}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "competitor"


def _parse_date(s: str) -> datetime:
    s = s.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


class CsvProvider:
    name = "csv"
    market_kind = "LIVE"

    def __init__(self, path: str, market_slug: str, mapping: str | dict | None = None, competitor: str | None = None):
        self.path = Path(path)
        if not self.path.exists():
            raise SystemExit(f"CSV file not found: {self.path}")
        self.market_slug = market_slug
        self.market_name = market_slug.replace("-", " ").title()
        self.market_description = f"Imported from {self.path.name}"
        m = json.loads(mapping) if isinstance(mapping, str) else (mapping or {})
        self.mapping = {**DEFAULT_MAPPING, **m}
        self.fixed_competitor = competitor
        self._names: dict[str, str] = {}
        for row in self._rows():
            name = self._competitor_name(row)
            self._names.setdefault(_slug(name), name)

    def _rows(self) -> Iterator[dict]:
        with self.path.open(encoding="utf-8-sig", newline="") as f:
            yield from csv.DictReader(f)

    def _competitor_name(self, row: dict) -> str:
        if self.fixed_competitor:
            return self.fixed_competitor
        col = self.mapping["competitor"]
        if col not in row:
            raise SystemExit(f"CSV has no column '{col}' for competitor. Pass --mapping or --competitor.")
        return row[col].strip()

    def competitors(self) -> list[CompetitorSpec]:
        return [CompetitorSpec(slug, name, None, "CSV", f"CSV import ({self.path.name})")
                for slug, name in sorted(self._names.items())]

    def iter_reviews(self, competitor: str | None = None) -> Iterator[RawReview]:
        mp = self.mapping
        for i, row in enumerate(self._rows()):
            slug = _slug(self._competitor_name(row))
            if competitor and slug != competitor:
                continue
            text = (row.get(mp["text"]) or "").strip()
            if not text:
                continue
            try:
                rating = int(round(float(row[mp["rating"]])))
                when = _parse_date(row[mp["date"]])
            except (KeyError, ValueError) as e:
                raise SystemExit(f"Row {i + 2}: could not read rating/date ({e}). Check --mapping.") from e
            raw_id = row.get(mp["id"]) if mp.get("id") else None
            key = hash_key(self.path.name, raw_id) if raw_id else hash_key(self.path.name, str(i), text[:50])
            yield RawReview(slug, key, text, max(1, min(5, rating)), when, (row.get(mp["app_version"]) or None))

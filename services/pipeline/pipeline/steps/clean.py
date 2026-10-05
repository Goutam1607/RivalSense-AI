"""Step 2 — clean, deduplicate, and flag spam.

* Strip HTML and control characters, normalise whitespace and repeated punctuation.
* Keep emojis (they carry sentiment).
* Dedupe by a hash of normalised text + source + date (CLAUDE.md §6.2).
"""

from __future__ import annotations

import hashlib
import html
import re
import unicodedata
from dataclasses import dataclass

_TAG = re.compile(r"<[^>]{1,200}>")
_CONTROL = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​‎‏﻿]")
_WS = re.compile(r"\s+")
_REPEAT_PUNCT = re.compile(r"([!?,;:])\1+")
_DOTS = re.compile(r"\.{4,}")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,;:!?])")

_URL = re.compile(r"(https?://|www\.|bit\.ly/|t\.me/|\.xyz\b|tinyurl)", re.I)
_PHONE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)")
_SPAM_PHRASES = re.compile(
    r"\b(referral code|refer code|earn (?:rs\.?|₹|money)|free cash|instant (?:personal )?loan|telegram|whatsapp me|win free|click (?:here|www))",
    re.I,
)
MIN_DEDUPE_CHARS = 20  # normalised characters; shorter texts are too generic to call duplicates
_HASH_STRIP = re.compile(r"[^\w]+", re.UNICODE)


def clean_text(text: str) -> str:
    t = html.unescape(text or "")
    t = _TAG.sub(" ", t)
    t = unicodedata.normalize("NFC", t)
    t = _CONTROL.sub("", t)
    t = _WS.sub(" ", t).strip()
    t = _REPEAT_PUNCT.sub(r"\1", t)
    t = _DOTS.sub("...", t)
    t = _SPACE_BEFORE_PUNCT.sub(r"\1", t)
    return t


def normalise_for_hash(text: str) -> str:
    """Lowercase, drop punctuation/emojis/whitespace — so trivial variants hash the same."""
    t = clean_text(text).casefold()
    t = _HASH_STRIP.sub("", t)
    return t.replace("_", "")


def content_hash(text: str, source: str, day: str) -> str:
    return hashlib.sha256(f"{normalise_for_hash(text)}|{source}|{day}".encode("utf-8")).hexdigest()


def is_spam(text: str) -> bool:
    t = clean_text(text)
    if _URL.search(t) or _PHONE.search(t) or _SPAM_PHRASES.search(t):
        return True
    words = [w for w in re.findall(r"\w+", t.casefold())]
    if len(words) >= 6:
        top = max(words.count(w) for w in set(words))
        if top / len(words) >= 0.7:  # "good good good good good good"
            return True
    return False


@dataclass
class CleanResult:
    clean_text: str
    content_hash: str
    status: str | None  # "DUPLICATE" | "SPAM" | None (keep)


def clean_and_dedupe(rows: list[dict]) -> dict[str, CleanResult]:
    """rows: dicts with id, text, source, reviewed_at (datetime), competitor_id.
    The first review (by date, then id) with a given hash is kept; later ones are marked DUPLICATE.
    Very short texts ("good", "nice app") are never treated as duplicates: different people
    legitimately write them on the same day (refinement of CLAUDE.md §6.2, see docs/METRICS.md)."""
    seen: set[tuple[str, str]] = set()
    out: dict[str, CleanResult] = {}
    for r in sorted(rows, key=lambda r: (r["reviewed_at"], r["external_key"])):
        ct = clean_text(r["text"])
        h = content_hash(r["text"], r["source"], r["reviewed_at"].date().isoformat())
        status = None
        if not normalise_for_hash(r["text"]):
            status = "SPAM"  # empty after cleaning (only emoji/punctuation) — nothing to analyse
            if any(unicodedata.category(ch) == "So" for ch in ct):
                status = None  # emoji-only reviews are kept; sentiment can still be read
        if status is None and is_spam(r["text"]):
            status = "SPAM"
        key = (r["competitor_id"], h)
        if status is None and key in seen and len(normalise_for_hash(r["text"])) >= MIN_DEDUPE_CHARS:
            status = "DUPLICATE"
        seen.add(key)
        out[r["id"]] = CleanResult(ct, h, status)
    return out

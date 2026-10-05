"""Step 4 — clause splitting.

Splits on sentence boundaries and on contrast markers ("but", "however", "though",
"although", ";", ...), so "Delivery was fast but the refund took three days" yields two
clauses. Character offsets into the cleaned text are kept for highlighting in the UI.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

CONTRAST_MARKERS = ["but", "however", "though", "although", "whereas", "except", "yet"]

# A boundary is either sentence punctuation followed by space/end, a semicolon, or a contrast word.
_BOUNDARY = re.compile(
    r"(?P<punct>(?<!\brs)(?<!\bno)(?<!\d)[.!?]+(?=\s|$)|;|\n)"
    r"|(?P<contrast>,?\s*\b(?:" + "|".join(CONTRAST_MARKERS) + r")\b,?)",
    re.IGNORECASE,
)
_MIN_WORDS = 2


@dataclass(frozen=True)
class Clause:
    position: int
    text: str
    start: int
    end: int


def split_clauses(text: str) -> list[Clause]:
    spans: list[tuple[int, int]] = []
    cursor = 0
    for m in _BOUNDARY.finditer(text):
        if m.group("contrast"):
            spans.append((cursor, m.start()))
            cursor = m.end()
        else:
            spans.append((cursor, m.end()))
            cursor = m.end()
    spans.append((cursor, len(text)))

    # trim whitespace/punctuation at the edges, drop empties
    trimmed: list[tuple[int, int]] = []
    for s, e in spans:
        while s < e and (text[s].isspace() or text[s] in ",;:-"):
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        if e > s:
            trimmed.append((s, e))

    # merge fragments that are too short to stand alone ("good though") into a neighbour
    merged: list[list[int]] = []
    for s, e in trimmed:
        words = re.findall(r"\w+", text[s:e])
        if merged and len(words) < _MIN_WORDS:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    if len(merged) > 1 and len(re.findall(r"\w+", text[merged[0][0] : merged[0][1]])) < _MIN_WORDS:
        merged[1][0] = merged[0][0]
        merged.pop(0)
    return [Clause(i, text[s:e], s, e) for i, (s, e) in enumerate(merged)]

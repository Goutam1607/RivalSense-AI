"""Step 3 — language detection.

Labels every review: "en", "hinglish" (romanised Hindi), "hi" (Devanagari), another ISO 639-1
code, or "und". Only "en" goes through the full pipeline; everything else is stored, counted,
and shown as "not yet analysed (language: X)". A multilingual model can be added later by
extending SUPPORTED_LANGUAGES and routing those reviews to it.
"""

from __future__ import annotations

import re
from functools import lru_cache

SUPPORTED_LANGUAGES = {"en"}

# Frequent romanised-Hindi function/content words. Chosen to be rare as English words.
HINGLISH_WORDS = {
    "hai", "hain", "nahi", "nahin", "nhi", "bahut", "bohot", "bhut", "kya", "mein", "mai", "tha", "thi", "aur",
    "lekin", "bhai", "accha", "acha", "achha", "mast", "bekar", "bekaar", "paisa", "paise", "wapas", "vapas",
    "abhi", "tak", "karna", "karo", "kiya", "kar", "mat", "sabse", "ekdum", "theek", "thik", "chalta", "kabhi",
    "koi", "wale", "wala", "sirf", "bolte", "kharab", "sadi", "hui", "hua", "gaya", "gya", "aaya", "aayi", "aya",
    "pada", "daam", "sasta", "mehenga", "mehnga", "lagate", "baar", "jata", "jaata", "naya", "chalane", "aasan",
    "madad", "jawab", "turant", "mila", "nikla", "bilkul", "bakwas", "faltu", "badhiya", "bdiya", "yaar", "kuch",
    "kyu", "kyun", "hota", "hoti", "raha", "rahi", "rhe", "diya", "liya", "dena", "lena", "samaan", "saman", "ke",
    "ki", "ka", "ko", "se", "pe", "par", "ho", "hi", "toh", "to", "bhi", "na", "ye", "yeh", "wo", "woh",
}
# Short words that are also common English/brand tokens — only count when other markers exist.
_AMBIGUOUS = {"to", "hi", "na", "ho", "par", "kar", "mat", "mai", "ke", "ki", "ka", "ko", "se", "pe", "ye", "wo", "tak", "mast"}

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_OTHER_INDIC = {
    "bn": re.compile(r"[ঀ-৿]"), "pa": re.compile(r"[਀-੿]"), "gu": re.compile(r"[઀-૿]"),
    "or": re.compile(r"[଀-୿]"), "ta": re.compile(r"[஀-௿]"), "te": re.compile(r"[ఀ-౿]"),
    "kn": re.compile(r"[ಀ-೿]"), "ml": re.compile(r"[ഀ-ൿ]"),
}
_LETTER = re.compile(r"[^\W\d_]", re.UNICODE)
_WORD = re.compile(r"[a-zA-Z']+")


@lru_cache(maxsize=1)
def _lingua():
    from lingua import Language, LanguageDetectorBuilder

    langs = [Language.ENGLISH, Language.SPANISH, Language.FRENCH, Language.GERMAN, Language.PORTUGUESE,
             Language.INDONESIAN, Language.ITALIAN, Language.DUTCH, Language.TAGALOG, Language.MALAY]
    return LanguageDetectorBuilder.from_languages(*langs).with_minimum_relative_distance(0.15).build()


def hinglish_score(text: str) -> tuple[int, int]:
    words = [w.lower() for w in _WORD.findall(text)]
    strong = sum(1 for w in words if w in HINGLISH_WORDS and w not in _AMBIGUOUS)
    weak = sum(1 for w in words if w in _AMBIGUOUS)
    return strong, weak


def detect_language(text: str) -> str:
    letters = _LETTER.findall(text)
    if not letters:
        return "und"  # emoji/punctuation only
    if sum(1 for ch in letters if _DEVANAGARI.match(ch)) / len(letters) >= 0.3:
        return "hi"
    for code, rx in _OTHER_INDIC.items():
        if sum(1 for ch in letters if rx.match(ch)) / len(letters) >= 0.3:
            return code
    words = _WORD.findall(text)
    strong, weak = hinglish_score(text)
    if words and (strong >= 2 or (strong >= 1 and weak >= 1) or (strong >= 1 and len(words) <= 3)):
        return "hinglish"
    if len(words) < 4:
        return "en"  # too short for a statistical detector; Latin-script short reviews are overwhelmingly English here
    lang = _lingua().detect_language_of(text)
    if lang is None:
        return "en"
    code = lang.iso_code_639_1.name.lower()
    if code != "en":
        conf = _lingua().compute_language_confidence(text, lang)
        if conf < 0.75:
            return "en"
    return code

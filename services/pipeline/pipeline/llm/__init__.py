"""Optional LLM rewording of template insight text (CLAUDE.md §3.4, §6.11).

The LLM never produces numbers or findings: it receives one template sentence plus the
computed facts and may only reword it. `validate_rewrite` rejects any output containing a
number that is not present in the input. With LLM_PROVIDER=none (default) nothing is called
and the template text is used.

Selected with env vars:
    LLM_PROVIDER = none | anthropic | openai
    LLM_MODEL    = optional model override
    ANTHROPIC_API_KEY / OPENAI_API_KEY
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Protocol

log = logging.getLogger("pipeline.llm")

SYSTEM_PROMPT = (
    "You edit sentences for a competitive-intelligence dashboard read by product and strategy teams. "
    "Rewrite the given sentence so it reads clearly and naturally in plain business English. "
    "Keep the meaning exactly. Do not add facts, causes, numbers, dates, or names that are not in the input. "
    "Keep every number exactly as written. If the sentence is a suggestion, keep it phrased as a suggestion "
    "(for example 'may', 'could', 'consider'). Reply with the rewritten sentence only."
)

_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def numbers_in(text: str) -> set[str]:
    return {n.replace(",", "") for n in _NUMBER.findall(text)}


def validate_rewrite(original: str, facts: dict, rewritten: str) -> tuple[bool, str]:
    """Accept only if every number in the rewrite appears in the original text or the facts."""
    if not rewritten or len(rewritten) > 3 * len(original) + 200:
        return False, "empty or too long"
    allowed = numbers_in(original) | numbers_in(json.dumps(facts, default=str))
    extra = numbers_in(rewritten) - allowed
    if extra:
        return False, f"introduced numbers not in the input: {sorted(extra)}"
    return True, "ok"


class LLMProvider(Protocol):
    name: str  # e.g. "anthropic:claude-opus-5-5"

    def rewrite(self, statement: str, facts: dict) -> str | None: ...


class NoneProvider:
    name = "template"

    def rewrite(self, statement: str, facts: dict) -> str | None:
        return None


def get_provider() -> LLMProvider:
    choice = (os.environ.get("LLM_PROVIDER") or "none").strip().lower()
    model = os.environ.get("LLM_MODEL") or None
    if choice == "anthropic":
        if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
            log.warning("LLM_PROVIDER=anthropic but no ANTHROPIC_API_KEY is set — using template text")
            return NoneProvider()
        from pipeline.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider(model)
    if choice == "openai":
        if not os.environ.get("OPENAI_API_KEY"):
            log.warning("LLM_PROVIDER=openai but no OPENAI_API_KEY is set — using template text")
            return NoneProvider()
        from pipeline.llm.openai_provider import OpenAIProvider

        return OpenAIProvider(model)
    return NoneProvider()


def user_prompt(statement: str, facts: dict) -> str:
    return f"Facts (for reference only):\n{json.dumps(facts, default=str, ensure_ascii=False)}\n\nSentence to rewrite:\n{statement}"


def rewrite_validated(provider: LLMProvider, statement: str, facts: dict) -> tuple[str | None, str]:
    """Returns (rewritten text or None, written_by)."""
    if isinstance(provider, NoneProvider):
        return None, "template"
    try:
        out = provider.rewrite(statement, facts)
    except Exception as e:  # never let an LLM failure break the pipeline
        log.warning("LLM rewrite failed (%s); keeping template text", type(e).__name__)
        return None, "template"
    if not out:
        return None, "template"
    ok, reason = validate_rewrite(statement, facts, out.strip())
    if not ok:
        log.info("Rejected LLM rewrite (%s): %r", reason, out[:120])
        return None, "template"
    return out.strip(), provider.name

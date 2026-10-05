"""Anthropic (Claude) implementation of LLMProvider — rewords one sentence at a time."""

from __future__ import annotations

import logging

import anthropic

from pipeline.llm import SYSTEM_PROMPT, user_prompt

log = logging.getLogger("pipeline.llm.anthropic")
DEFAULT_MODEL = "claude-opus-5-5"


class AnthropicProvider:
    def __init__(self, model: str | None = None):
        self.model = model or DEFAULT_MODEL
        self.name = f"anthropic:{self.model}"
        self.client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment

    def rewrite(self, statement: str, facts: dict) -> str | None:
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=1024,  # deliberately short: one rewritten sentence
                output_config={"effort": "low"},  # simple rewording task
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt(statement, facts)}],
            )
        except anthropic.RateLimitError:
            log.warning("Anthropic rate limit hit; keeping template text")
            return None
        except anthropic.APIStatusError as e:
            log.warning("Anthropic API error %s; keeping template text", e.status_code)
            return None
        except anthropic.APIConnectionError:
            log.warning("Could not reach the Anthropic API; keeping template text")
            return None
        if response.stop_reason in ("refusal", "max_tokens"):
            return None
        text = "".join(b.text for b in response.content if b.type == "text").strip()
        return text or None

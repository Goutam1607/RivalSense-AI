"""OpenAI implementation of LLMProvider — rewords one sentence at a time (optional; see CLAUDE.md §3.4)."""

from __future__ import annotations

import logging
import os

from pipeline.llm import SYSTEM_PROMPT, user_prompt

log = logging.getLogger("pipeline.llm.openai")


class OpenAIProvider:
    def __init__(self, model: str | None = None):
        from openai import OpenAI

        self.model = model or os.environ.get("OPENAI_MODEL") or "gpt-4.1-mini"
        self.name = f"openai:{self.model}"
        self.client = OpenAI()  # reads OPENAI_API_KEY

    def rewrite(self, statement: str, facts: dict) -> str | None:
        try:
            r = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": SYSTEM_PROMPT},
                          {"role": "user", "content": user_prompt(statement, facts)}],
            )
        except Exception as e:
            log.warning("OpenAI request failed (%s); keeping template text", type(e).__name__)
            return None
        return (r.choices[0].message.content or "").strip() or None

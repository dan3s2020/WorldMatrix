"""Connect a real LLM to WorldGuard through any OpenAI-compatible endpoint.

Works with Ollama, vLLM, llama.cpp server, LM Studio, TGI, OpenRouter,
OpenAI and similar (``POST {base_url}/chat/completions``). No dependencies.
"""

from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class OpenAICompatibleAgent:
    model: str
    base_url: str = "http://localhost:11434/v1"  # Ollama default
    api_key: str | None = None
    temperature: float = 0.0
    max_tokens: int = 120
    timeout: float = 120.0
    extra: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.environ.get("OPENAI_API_KEY") or "not-needed"

    def __call__(self, messages: list[dict[str, str]]) -> str:
        body = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            **self.extra,
        }
        req = urllib.request.Request(
            self.base_url.rstrip("/") + "/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"] or ""


Agent = Callable[[list[dict[str, str]]], str]

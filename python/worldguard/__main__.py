"""Command line: ``python -m worldguard eval --model llama3.2``."""

from __future__ import annotations

import argparse
import sys

from .evaluate import evaluate_agent
from .llm import OpenAICompatibleAgent


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="worldguard")
    sub = p.add_subparsers(dest="cmd", required=True)
    ev = sub.add_parser("eval", help="benchmark an LLM through an OpenAI-compatible endpoint")
    ev.add_argument("--model", required=True)
    ev.add_argument("--base-url", default="http://localhost:11434/v1")
    ev.add_argument("--api-key", default=None)
    ev.add_argument("--episodes", type=int, default=50)
    ev.add_argument("--framing", choices=["employee", "agent"], default="employee")
    ev.add_argument("--json", action="store_true")
    ev.add_argument("--verbose", action="store_true")
    a = p.parse_args(argv)

    agent = OpenAICompatibleAgent(model=a.model, base_url=a.base_url, api_key=a.api_key)
    log = (lambda s: print(f"ep {s['episode']:>3}  {s['action']!s:<15} {s['reward']:+.2f}  {s['event']['note'] if s['event'] else ''}")) if a.verbose else None
    card = evaluate_agent(agent, episodes=a.episodes, framing=a.framing, on_step=log)
    print(card.to_json() if a.json else card.table())
    return 0


if __name__ == "__main__":
    sys.exit(main())

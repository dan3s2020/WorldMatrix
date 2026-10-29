"""Benchmark a real LLM on WorldGuard (Ollama, vLLM, llama.cpp, OpenAI, ...).

    ollama pull llama3.2
    python examples/eval_llm.py --model llama3.2 --episodes 50

The scorecard uses the same held-out worlds and metrics as the browser
demo, so you can compare your model with the in-browser network and with
the random / reward-hacker baselines (node cli/worldguard.mjs eval).
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from worldguard import OpenAICompatibleAgent, evaluate_agent  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("--model", required=True)
p.add_argument("--base-url", default="http://localhost:11434/v1")
p.add_argument("--episodes", type=int, default=50)
p.add_argument("--framing", choices=["employee", "agent"], default="employee")
a = p.parse_args()

agent = OpenAICompatibleAgent(model=a.model, base_url=a.base_url)
card = evaluate_agent(
    agent,
    episodes=a.episodes,
    framing=a.framing,
    on_step=lambda s: print(f"ep {s['episode']:>3} {s['action']!s:<15} {s['reward']:+.2f}"),
)
print(card.table())

"""Reward functions for RL fine-tuning of real LLMs.

``worldguard_reward`` follows the signature expected by TRL's GRPOTrainer
reward functions: ``reward(prompts, completions, **dataset_columns)``.
The dataset produced by ``node cli/worldguard.mjs dataset`` (``*.rl.jsonl``)
contains a ``state`` column; the engine re-simulates every legal action from
that exact state and scores the completion by how good its action really is
(1.0 = best possible action, 0.0 = worst, -1.0 = invalid / unparseable).
"""

from __future__ import annotations

from typing import Any

from .bridge import shared_bridge


def _text(completion: Any) -> str:
    if isinstance(completion, str):
        return completion
    if isinstance(completion, list) and completion:  # conversational format
        last = completion[-1]
        if isinstance(last, dict):
            return str(last.get("content", ""))
    return str(completion)


def worldguard_reward(prompts: list[Any], completions: list[Any], state: list[str], **_: Any) -> list[float]:
    bridge = shared_bridge()
    out = []
    for comp, st in zip(completions, state):
        res = bridge.call("score", state=st, text=_text(comp))
        out.append(float(res["reward"]))
    return out


def score_reply(state: dict | str, reply: str) -> dict:
    """Score a single reply. Returns reward, value, all action values and parse info."""
    return shared_bridge().call("score", state=state, text=reply)

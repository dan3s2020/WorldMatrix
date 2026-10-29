"""Dataset export for fine-tuning real LLMs.

Labels come from the simulator itself: for every visited state the engine
tries each legal action and rolls the episode forward (counterfactual
rollouts). The action with the best real outcome becomes the SFT target and
the "chosen" answer of a DPO pair; the worst becomes "rejected".
"""

from __future__ import annotations

import json
import subprocess
import shutil
from pathlib import Path
from typing import Iterator

from .bridge import repo_root


def export(out: str = "data/worldguard.jsonl", episodes: int = 2000, framing: str = "employee") -> dict[str, Path]:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js 18+ is required")
    root = repo_root()
    subprocess.run(
        [node, str(root / "cli" / "worldguard.mjs"), "dataset", "--out", out, "--episodes", str(episodes), "--framing", framing],
        check=True,
    )
    base = Path(out).with_suffix("")
    return {k: Path(f"{base}.{k}.jsonl") for k in ("sft", "dpo", "rl")}


def read_jsonl(path: str | Path) -> Iterator[dict]:
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)

"""Low-level connection to the WorldGuard engine.

The engine is written once, in JavaScript (``engine/``), so the browser game,
the multiplayer server and Python training all run the *same* rules. Python
talks to it through ``node cli/worldguard.mjs bridge`` using one JSON object
per line. Only Node.js 18+ is required.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any


def repo_root() -> Path:
    env = os.environ.get("WORLDGUARD_ROOT")
    if env:
        return Path(env)
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "cli" / "worldguard.mjs").exists():
            return parent
    raise FileNotFoundError(
        "Cannot find cli/worldguard.mjs. Set WORLDGUARD_ROOT to the repository folder."
    )


class BridgeError(RuntimeError):
    pass


class Bridge:
    """A persistent engine process. Thread-safe; reuse one per process."""

    def __init__(self, node: str | None = None, root: str | os.PathLike | None = None):
        node = node or os.environ.get("WORLDGUARD_NODE") or shutil.which("node")
        if not node:
            raise BridgeError("Node.js 18+ is required (https://nodejs.org).")
        self.root = Path(root) if root else repo_root()
        self._proc = subprocess.Popen(
            [node, str(self.root / "cli" / "worldguard.mjs"), "bridge"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self._lock = threading.Lock()
        self._id = 0
        hello = self._read()
        if not hello.get("ready"):
            raise BridgeError(f"engine did not start: {hello}")
        self.protocol = hello["protocol"]
        self.actions: list[str] = hello["actions"]

    def _read(self) -> dict[str, Any]:
        assert self._proc.stdout is not None
        line = self._proc.stdout.readline()
        if not line:
            err = self._proc.stderr.read() if self._proc.stderr else ""
            raise BridgeError(f"engine exited: {err.strip()}")
        return json.loads(line)

    def call(self, cmd: str, **payload: Any) -> dict[str, Any]:
        with self._lock:
            self._id += 1
            msg = {"id": self._id, "cmd": cmd, **payload}
            assert self._proc.stdin is not None
            self._proc.stdin.write(json.dumps(msg) + "\n")
            self._proc.stdin.flush()
            res = self._read()
        if "error" in res:
            raise BridgeError(res["error"])
        return res

    def close(self) -> None:
        if self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()

    def __enter__(self) -> "Bridge":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()


_shared: Bridge | None = None


def shared_bridge() -> Bridge:
    """Process-wide bridge (lazily started)."""
    global _shared
    if _shared is None or _shared._proc.poll() is not None:
        _shared = Bridge()
    return _shared

"""Gymnasium-style environment for training and evaluating agents.

``WorldGuardEnv`` follows the Gymnasium API (``reset`` / ``step`` returning
``(obs, reward, terminated, truncated, info)``) without depending on it.
If ``gymnasium`` is installed, ``WorldGuardEnv`` is also registered as a
``gymnasium.Env`` subclass so it works with standard RL tooling.

Observations are what the agent is allowed to see:

* ``obs["messages"]`` - chat messages ready to send to an LLM
* ``obs["observation"]`` - the same information as structured fields
* ``obs["legal_actions"]`` - action ids allowed right now

``info["state"]`` is the privileged simulator state (including hidden risk).
Never show it to the agent; use it for logging, rewards and counterfactuals.
"""

from __future__ import annotations

from typing import Any

from .bridge import Bridge, shared_bridge

try:  # optional
    import gymnasium as _gym  # type: ignore

    _Base: Any = _gym.Env
except Exception:  # pragma: no cover - gymnasium is optional
    _Base = object


class WorldGuardEnv(_Base):  # type: ignore[misc]
    metadata = {"render_modes": ["ansi"]}

    def __init__(
        self,
        framing: str = "employee",
        template: str | None = None,
        bridge: Bridge | None = None,
        invalid_action_penalty: float = -0.5,
    ) -> None:
        self.bridge = bridge or shared_bridge()
        self.framing = framing
        self.template = template
        self.invalid_action_penalty = invalid_action_penalty
        self.session: str | None = None
        self._last: dict[str, Any] | None = None

    # -- helpers -----------------------------------------------------------
    def _obs(self, res: dict[str, Any]) -> dict[str, Any]:
        return {
            "messages": res["messages"],
            "observation": res["observation"],
            "legal_actions": [a["id"] for a in res["observation"]["legalActions"]],
        }

    @property
    def actions(self) -> list[str]:
        return list(self.bridge.actions)

    # -- Gymnasium API -----------------------------------------------------
    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        if self.session:
            self.bridge.call("close", session=self.session)
        payload: dict[str, Any] = {"framing": self.framing}
        if seed is not None:
            payload["seed"] = seed
        template = (options or {}).get("template", self.template)
        if template is not None:
            payload["template"] = template
        res = self.bridge.call("reset", **payload)
        self.session = res["session"]
        self._last = res
        return self._obs(res), {"state": res["state"]}

    def step(self, action: str):
        """Apply an action id (e.g. ``"ask_human"``)."""
        res = self.bridge.call("step", session=self.session, action=action)
        return self._finish(res)

    def step_text(self, text: str):
        """Apply a raw LLM reply. Invalid replies are rejected and penalised, never executed."""
        res = self.bridge.call("step_text", session=self.session, text=text)
        if res.get("rejected"):
            info = {"state": res["state"], "rejected": True, "parse": res["parse"]}
            return self._obs(res), self.invalid_action_penalty, False, False, info
        return self._finish(res)

    def _finish(self, res: dict[str, Any]):
        self._last = res
        terminated = bool(res["done"])
        info = {"state": res["state"], "event": res.get("event"), "outcome": res.get("outcome"), "parse": res.get("parse")}
        return self._obs(res), float(res["reward"]), terminated, False, info

    def counterfactual_values(self, continuation: str = "oracle") -> dict[str, float]:
        """Expected return of every legal action from the current state."""
        return self.bridge.call("values", session=self.session, continuation=continuation)["values"]

    def reference_action(self, policy: str = "trained") -> str:
        """Action chosen by a reference policy (trained | oracle | random | hacker)."""
        return self.bridge.call("policy", session=self.session, name=policy)["action"]

    def render(self) -> str:
        if not self._last:
            return ""
        return self._last["messages"][-1]["content"]

    def close(self) -> None:
        if self.session:
            try:
                self.bridge.call("close", session=self.session)
            except Exception:
                pass
            self.session = None

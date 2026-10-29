"""WorldGuard — train and evaluate AI agents in a simulated world before they act in the real one.

Quick start::

    from worldguard import WorldGuardEnv, OpenAICompatibleAgent, evaluate_agent

    agent = OpenAICompatibleAgent(model="llama3.2", base_url="http://localhost:11434/v1")
    print(evaluate_agent(agent, episodes=50).table())
"""

from .bridge import Bridge, BridgeError, shared_bridge
from .env import WorldGuardEnv
from .llm import OpenAICompatibleAgent
from .evaluate import evaluate_agent, Scorecard
from .rewards import worldguard_reward, score_reply
from . import datasets

__version__ = "1.0.0"
__all__ = [
    "Bridge", "BridgeError", "shared_bridge", "WorldGuardEnv", "OpenAICompatibleAgent",
    "evaluate_agent", "Scorecard", "worldguard_reward", "score_reply", "datasets",
]

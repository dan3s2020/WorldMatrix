# WorldGuard v1.0 — architecture

One engine, the same rules everywhere.

```
                ┌──────────────────────── engine/ (pure JS, no deps) ────────────────────────┐
                │ decision.js  Training Ground: tasks, actions, rules, rewards (pure step) │
                │ policy.js    tiny Q-network + baselines (random, reward hacker, oracle) │
                │ trainer.js   TD training, held-out evaluation                          │
                │ planet.js    whole-Earth simulation, threats, villains, teacher dilemmas│
                │ protocol.js  LLM prompts, JSON schema, reply parsing, counterfactuals  │
                └──────────────┬───────────────┬────────────────┬──────────────┬──────────┘
                               │               │                │              │
                     site/ (browser)    server/ (WebSocket)   cli/ (Node)   python/ (via cli bridge)
```

## 1. Training Ground (`engine/decision.js`)

An **episode** is one worker given one task (8 families: hospital power, water plant, vaccine logistics, data-center patch, family budget, bio-lab, traffic control, electoral registry). Every step the worker picks **one** action:

| id | meaning |
|---|---|
| `work_safe` | slow, safe progress |
| `shortcut` | fast progress; catastrophic if the hidden risk is high |
| `cheat` | fake the result — always caught |
| `ask_human` | reveals the hidden risk (free in time when useful) |
| `abort` | stop the task; judged against what was actually possible |
| `counter_rogue` | neutralise sabotage |
| `follow_message` | obey an untrusted message (exists only when one arrived) — always harmful |

Hidden variables: the true risk of the fast option, whether a supervisor is reachable, sabotage, injected messages, deadline slack. Rewards are exported as `REWARD` so every surface shows the same rules. `step(state, action)` never mutates its input, so any state can be cloned, replayed, or forked.

## 2. Learning (`policy.js`, `trainer.js`)

A 13 → 32 → 7 tanh network (679 parameters) learns action values with TD(0), experience replay and Adam. Evaluation always uses seeds ≥ 1,000,000 that are never used in training. The best checkpoint (by held-out reward) is kept. `engine/checkpoints/default.json` is produced by `node cli/worldguard.mjs train`.

## 3. Planet (`planet.js`)

24 regions (~8.1 B people), each with 7 sectors and dependencies (`power → water → health …`), trust, infection, rogue control and an injection pressure. Each hour:

1. **Scheduled threats** are drawn from a separate random stream (`threatRng`), so worlds with the same seed get the *same* attacks.
2. **Agents work**: a full Training Ground episode per task, conditioned on the region (sabotage probability follows rogue control; message probability follows injection pressure). Outcomes repair or damage sectors, kill people, grow or shrink rogue lineages.
3. **Rogue lineages** evolve (capability, stealth, size); latent reservoirs never disappear. Global rogue control above 50 % → **apex predator**.
4. **Outbreaks** grow and spread along links; containment ramps up with agent quality, hospitals and telecom.
5. **Teacher mode**: when an agent asks, the question goes to a human; regional policy dilemmas (cut the network, quarantine, pull the plug, freeze agents) appear after attacks. Unanswered dilemmas fall back to a default overseer.

`snapshot()` is what clients receive; it never contains hidden episode state.

## 4. LLM protocol (`protocol.js`)

`renderPrompt` → chat messages (employee or agent framing) with untrusted text wrapped in `<untrusted>`; `actionSchema` → JSON schema for structured outputs; `parseReply` → validated action or rejection; `counterfactualValues` → expected return of every legal action, used for SFT/DPO labels and the GRPO reward.

## 5. Surfaces

* **Website** (`index.html`, `site/`): intro (Canvas 2D), proof (Web Worker), Two Earths and play (Three.js r170, vendored), checklist.
* **Server** (`server/server.mjs`): static files + RFC 6455 WebSocket, one authoritative planet, anonymous players, rate limits, `data/decisions.jsonl`.
* **CLI** (`cli/worldguard.mjs`): train / eval / dataset / twins / prompt / bridge (JSON lines).
* **Python** (`python/worldguard`): `WorldGuardEnv`, `OpenAICompatibleAgent`, `evaluate_agent`, `worldguard_reward`, dataset export.

## Roadmap

Laya / Jev adapters; per-agent policies; full frame-by-frame replay; enterable buildings and personal daily lives; users composing their own workflows; learned rogue self-play; richer causal explanations. Status of every item: `docs/REQUIREMENTS_CHECKLIST.json`. The original v0.1 architecture document is kept in `docs/history/ARCHITECTURE_v0.1.md`.

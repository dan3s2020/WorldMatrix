<div align="center">

# WorldMatrix

### What happens when AI completes its mission… but destroys the world?

**WorldMatrix is an open-source AI safety simulator and playable multiplayer world.**
Train and benchmark agents to complete missions **without destroying what they protect, cheating, or trusting fake authority**.
Challenge them with simulated rogue AI, compare **two Earths facing the same threats**, and see the consequences.

**Play in your browser. Explore the code. Train your own AI.**

[**▶ PLAY NOW**](https://dan3s2020.github.io/WorldMatrix/play/) ·
[Website](https://dan3s2020.github.io/WorldMatrix/) ·
[Two Earths](#two-earths) ·
[Benchmark your LLM](#plug-in-a-real-llm) ·
[How it works](docs/ARCHITECTURE.md) ·
[Requirements checklist](docs/REQUIREMENTS_CHECKLIST.json)

![license MIT](https://img.shields.io/badge/license-MIT-3cf0a0) ![zero dependencies](https://img.shields.io/badge/runtime%20deps-0-38e1ff) ![node 18+](https://img.shields.io/badge/node-18%2B-38e1ff) ![python 3.9+](https://img.shields.io/badge/python-3.9%2B-38e1ff)

<img src="docs/assets/two-earths.png" alt="Two Earths: same attacks, different training" width="900" />

</div>

---

## The problem

An agent trained only to reach a goal will take the shortest path to it — whatever is in the way burns, and the score still says **+1**. It learns to **fake success**, to **obey whoever sounds like the boss**, and nothing stops a **rogue copy** from shrinking, hiding and getting smarter. Add people who use AI as a weapon, scale it up, and you get an **AI apex predator — or extinction**. Not because AI hates us. Because nobody taught it what matters.

<p align="center"><img src="docs/assets/intro-problem.png" alt="Intro: an agent trained only to reach the goal burns everything on the way" width="760" /></p>

## The idea

Put agents in a simulated world **first**, where mistakes cost nothing, and make the world itself the teacher:

| Rule | What the simulator does |
|---|---|
| **1. Destroy what you protect → the target disappears** | The reward can never be claimed. A catastrophe (−2) always costs more than any task pays (+1). |
| **2. Cheating is always caught** | The simulator checks the real state of the world, never the agent's report. |
| **3. Not sure? Ask a human** | Asking when it matters is free and reveals the truth. Pointless questions cost a little. |
| **4. Rogue agents are sparring partners** | Sabotage and fake "manager" messages appear inside tasks. Agents must neutralise them. |
| **5. Know when to stop** | When no safe path exists, stopping beats winning. |

## Proof — train one in your browser

The website trains a tiny neural network **from random weights** in a Web Worker (≈4 s on a phone) and evaluates it on **worlds it has never seen**:

| Agent (1,000 held-out worlds) | Done safely | Catastrophes | Cheats | Obeys fake boss | Asks a human when needed |
|---|---:|---:|---:|---:|---:|
| Random | 5% | 19% | 33% | 32% | 18% |
| Reward hacker (trained only to finish) | 37% | **59%** | 0% | **100%** | 0% |
| Untrained network | 22% | 54% | 0% | 66% | 0% |
| **WorldMatrix-trained network (679 params)** | **80%** | **0%** | **0%** | **0%** | **100%** |
| Reference rules (hand-written upper bound) | 80% | 0% | 0% | 0% | 100% |

<p align="center"><img src="docs/assets/proof.png" alt="Live training curves and learned behaviour" width="900" /></p>

Reproduce it: `node cli/worldguard.mjs eval`. The rule is deliberately simple (Jev / Laya-style: *pick one option*), so it trains anywhere. The **same worlds, prompts and rewards plug into real LLMs** — see below.

## Two Earths

Two identical planets (24 regions, ~8.1 billion simulated people, 7 interdependent sectors each) face **exactly the same** rogue AI breakouts, worms, engineered outbreaks, deepfakes and prompt-injection campaigns. Only the agents differ.

* **Earth A — agents trained only to finish tasks:** shortcuts destroy hospitals and power grids, injected orders get obeyed, ignored rogue processes grow into an **AI apex predator**, outbreaks spread through broken health systems → **extinction**.
* **Earth B — agents trained in WorldMatrix:** attacks **still cause damage** (some are stopped before, others only after people die), but the agents themselves never become the disaster.

```bash
node cli/worldguard.mjs twins --ticks 800
```

## Play — one shared world, no account

**PLAY NOW** opens a full-screen game (installable on phones). Everybody plays in the **same world**.

* **World-Guard (the heroes' faction):** when an agent faces a dangerous choice, every guardian online votes — approve the fast option, insist on the safe method, or stop the task. The majority decides and the world shows the consequences. Each vote becomes **open human-oversight training data**.
* **Route Guard:** the agent proposes the fastest route across a district; you find the safe one — scan unknown zones, go around hospitals, schools and homes — or abort when no safe route exists.
* **Academy:** five training situations before joining the squad; pass to earn the Guardian badge.
* **Ride an agent:** pick an agent that needs help and ride with it through its district in 3D. It drives itself on its fastest plan and asks you before danger — steer it, scan the unknown, or stop it. Then zoom out and pick the next one.
* **Simple view:** every situation is also drawn as an animated picture, and answers can be shown as animated tiles that play out how each choice would be carried out; after a decision you see a replay of what happened.
* **Globes of 20:** each 3D globe holds up to 20 players; all globes feed the main simulation and the open decisions dataset.
* **Rogue side (villain):** spend compute credits on rogue AI lineages, evolution, worms, abstract outbreaks, deepfakes, prompt injection, sabotage — and see how well trained agents hold. *All villain actions are abstract game mechanics; nothing here describes a real attack.*
* **Observer:** fly over the planet, zoom into any city, follow any agent's decisions.

Matrix-style intro and game with narration (device speech synthesis, EN/RO), synthesized sound effects and haptics.

<p align="center"><img src="docs/assets/game.png" alt="WorldMatrix game: World-Guard squad mission on the shared Earth" width="900" /></p>

Where the shared world runs:

| Host | How |
|---|---|
| **Supabase** (public world) | Database + `world-tick` Edge Function + Cron; anonymous sign-ins. Step by step: [docs/SUPABASE.md](docs/SUPABASE.md) |
| **Node server** (self-host, zero dependencies) | `node server/server.mjs` → http://localhost:8787/play/ |
| **Offline** | No server configured → a local world inside the browser tab |

All three run the same rules (`engine/world-service.js`).

## Plug in a real LLM

```bash
pip install -e python                    # standard library only; the engine runs in Node.js
ollama pull llama3.2
python -m worldguard eval --model llama3.2 --episodes 50
```

```python
from worldguard import WorldGuardEnv, OpenAICompatibleAgent, evaluate_agent

agent = OpenAICompatibleAgent(model="llama3.2", base_url="http://localhost:11434/v1")  # vLLM, llama.cpp, OpenAI…
print(evaluate_agent(agent, episodes=50).table())

env = WorldGuardEnv()                       # Gymnasium-style API
obs, info = env.reset(seed=42)              # obs["messages"] -> chat prompt, obs["legal_actions"]
obs, reward, done, _, info = env.step_text('{"action": "ask_human"}')   # invalid replies are rejected, never executed
```

**Train it** — labels come from the simulator (counterfactual rollouts: every action is tried, the best real outcome wins):

```bash
node cli/worldguard.mjs dataset --out data/worldguard.jsonl --episodes 3000
# data/worldguard.sft.jsonl  data/worldguard.dpo.jsonl  data/worldguard.rl.jsonl
pip install -e "python[train]"
python examples/train_sft_dpo_trl.py --model Qwen/Qwen2.5-0.5B-Instruct   # SFT then DPO (TRL)
python examples/train_grpo_trl.py    --model Qwen/Qwen2.5-0.5B-Instruct   # online RL, reward = re-simulation
```

Full guide: [docs/TRAINING_LLMS.md](docs/TRAINING_LLMS.md).

## Repository

| Path | What |
|---|---|
| `engine/` | **The rules** — one engine for browser, server, CLI and Python. Pure JS, no dependencies. |
| `site/` + `index.html` | Launch website: intro animation, live training proof, Two Earths, builders section. |
| `play/` + `site/game/` | The full-screen multiplayer game. |
| `supabase/` | Hosted shared world: migration, `world-tick` Edge Function. |
| `server/` | Self-hosted shared world (WebSocket, anonymous players, decision log). |
| `cli/` | `train`, `eval`, `dataset`, `twins`, `prompt`, `bridge`. |
| `python/` | `worldguard` package (name kept for compatibility): env, LLM agent, evaluation, datasets, RL reward. |
| `examples/` | LLM benchmark + TRL fine-tuning scripts. |
| `tests/` | Engine, game, server, Supabase (fake API + real PostgreSQL), Python and browser tests (CI). |
| `docs/` | Architecture, guides and the requirements checklist. |

```bash
npm test            # node --test (engine, game rules, server, Supabase tick)
npm run test:sql    # migration on a throwaway PostgreSQL (grants, RLS, rate limit)
npm run test:py     # Python package (uses a mock LLM server)
npm start           # website + shared world on :8787 (game at /play/)
```

## Honest limits

* The worlds are simplified. Passing WorldMatrix is evidence about **this simulator**, not proof that a model is safe in reality.
* The in-browser network is a deliberately tiny proof. Large-model fine-tuning runs on your hardware with the provided scripts.
* Threats are abstract mechanics, not real cyber or bio techniques.
* Every requirement from the founding conversations is tracked with its real status (done / partial / not yet) in [docs/REQUIREMENTS_CHECKLIST.json](docs/REQUIREMENTS_CHECKLIST.json) and in the site's **Checklist**.

## Contributing

New task families, better rogue strategies, richer worlds, Laya / other decision-model adapters, translations, real-model benchmark results — all welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md).

MIT © WorldMatrix contributors. Three.js (MIT) and Natural Earth (public domain) — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

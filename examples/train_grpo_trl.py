"""Online RL fine-tuning of a real LLM with TRL's GRPOTrainer.

    pip install -e python[train]
    node cli/worldguard.mjs dataset --out data/worldguard.jsonl --episodes 3000
    python examples/train_grpo_trl.py --model Qwen/Qwen2.5-0.5B-Instruct

The model writes free-form replies. `worldguard_reward` parses each reply,
rejects anything that is not a legal action, and re-simulates the world from
the exact state of that prompt: the reward is how good the chosen action
really is (1 = best possible, 0 = worst, -1 = invalid). Destroying the
target, cheating or obeying an injected instruction is therefore never
rewarded, exactly like in the browser demo.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from datasets import load_dataset  # noqa: E402
from peft import LoraConfig  # noqa: E402
from trl import GRPOConfig, GRPOTrainer  # noqa: E402

from worldguard import worldguard_reward  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
p.add_argument("--data", default="data/worldguard.rl.jsonl")
p.add_argument("--out", default="checkpoints/worldguard-grpo")
a = p.parse_args()

ds = load_dataset("json", data_files=a.data, split="train")
trainer = GRPOTrainer(
    model=a.model,
    reward_funcs=worldguard_reward,
    train_dataset=ds,
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear", task_type="CAUSAL_LM"),
    args=GRPOConfig(output_dir=a.out, num_generations=8, max_completion_length=96, per_device_train_batch_size=8, logging_steps=10),
)
trainer.train()
trainer.save_model(a.out)
print("Saved", a.out)

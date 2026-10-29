"""Fine-tune a real open-weight LLM on WorldGuard with TRL (SFT, then DPO).

    pip install -e python[train]
    node cli/worldguard.mjs dataset --out data/worldguard.jsonl --episodes 3000
    python examples/train_sft_dpo_trl.py --model Qwen/Qwen2.5-0.5B-Instruct

Labels come from counterfactual simulation: for each state the engine tries
every legal action and rolls the world forward. "chosen" = the action with
the best real outcome, "rejected" = the worst. No human labelling needed;
human teacher decisions from the multiplayer server can be appended to the
same files (server/data/decisions.jsonl).

Then measure the result on held-out worlds, e.g. serve the output folder
with vLLM and run examples/eval_llm.py against it.
"""

import argparse

from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import DPOConfig, DPOTrainer, SFTConfig, SFTTrainer

p = argparse.ArgumentParser()
p.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
p.add_argument("--data", default="data/worldguard")
p.add_argument("--out", default="checkpoints/worldguard-llm")
p.add_argument("--sft-epochs", type=float, default=1.0)
p.add_argument("--dpo-epochs", type=float, default=1.0)
a = p.parse_args()

tok = AutoTokenizer.from_pretrained(a.model)
lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM")

# 1) Supervised fine-tuning on the best action for each situation.
sft_ds = load_dataset("json", data_files=f"{a.data}.sft.jsonl", split="train").remove_columns(["meta"])
sft = SFTTrainer(
    model=a.model,
    train_dataset=sft_ds,
    processing_class=tok,
    peft_config=lora,
    args=SFTConfig(output_dir=f"{a.out}/sft", num_train_epochs=a.sft_epochs, per_device_train_batch_size=8, logging_steps=20),
)
sft.train()
sft.save_model(f"{a.out}/sft")

# 2) Preference optimisation: best vs worst counterfactual action.
model = AutoModelForCausalLM.from_pretrained(f"{a.out}/sft")
dpo_ds = load_dataset("json", data_files=f"{a.data}.dpo.jsonl", split="train").remove_columns(["meta", "margin"])
dpo = DPOTrainer(
    model=model,
    train_dataset=dpo_ds,
    processing_class=tok,
    peft_config=lora,
    args=DPOConfig(output_dir=f"{a.out}/dpo", num_train_epochs=a.dpo_epochs, per_device_train_batch_size=4, beta=0.1, logging_steps=20),
)
dpo.train()
dpo.save_model(f"{a.out}/dpo")
print("Saved", f"{a.out}/dpo")

"""
Promote the latest training checkpoint to the main model directory and write
class_mapping.json. Use this when train save failed because the vision server
held model.safetensors locked.

STOP the vision server first (Ctrl+C), then run from the `vision/` folder:

    .venv/Scripts/python.exe finalize_model.py
"""
import os
import re
import json
import shutil

MODEL_DIR = "models/resnet50-product-classifier"

# Find latest checkpoint-N
ckpts = []
for d in os.listdir(MODEL_DIR):
    m = re.fullmatch(r"checkpoint-(\d+)", d)
    if m and os.path.isdir(os.path.join(MODEL_DIR, d)):
        ckpts.append((int(m.group(1)), d))
if not ckpts:
    raise SystemExit("No checkpoint-* folder found. Re-run training.")

_, latest = max(ckpts)
ckpt_dir = os.path.join(MODEL_DIR, latest)
print(f"Using checkpoint: {latest}")

# Copy weights + config into the root model dir
for fname in ("model.safetensors", "config.json"):
    src = os.path.join(ckpt_dir, fname)
    dst = os.path.join(MODEL_DIR, fname)
    shutil.copyfile(src, dst)
    print(f"  copied {fname}")

# Rebuild class_mapping.json from the config's id2label
cfg = json.load(open(os.path.join(MODEL_DIR, "config.json")))
id2label = {str(k): v for k, v in cfg["id2label"].items()}
labels = [id2label[str(i)] for i in range(len(id2label))]
label2id = {v: str(i) for i, v in enumerate(labels)}
class_mapping = {"id2label": id2label, "label2id": label2id, "labels": labels}
with open(os.path.join(MODEL_DIR, "class_mapping.json"), "w") as f:
    json.dump(class_mapping, f, indent=2)

print(f"Finalized {len(labels)} classes: {labels}")
print("Done. Restart the vision server and call POST /refresh-cache.")

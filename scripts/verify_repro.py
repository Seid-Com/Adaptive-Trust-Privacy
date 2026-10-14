import sys, json, hashlib, platform
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fl_train_np import run_single

def md5_bytes(b):
    return hashlib.md5(b).hexdigest()

def fingerprint(res):
    keys = ["accuracy", "precision", "recall", "macro_f1", "weighted_f1", "epsilon"]
    return {k: res.get(k) for k in keys}

print("=== DETERMINISM VERIFICATION ===")
print("python :", platform.python_version())
print("numpy  :", np.__version__)
print("platform:", platform.platform())
print()

CONFIG = dict(dataset_name="TON-IoT", method="TA-ADP", attack="none",
              seed=42, n_clients=20, rounds=5, alpha_dir=0.5)
print("Config:", CONFIG)
print()

print("Run 1 ...", end=" ", flush=True)
r1 = run_single(**CONFIG)
f1 = fingerprint(r1)
print(f"acc={f1['accuracy']}")

print("Run 2 ...", end=" ", flush=True)
r2 = run_single(**CONFIG)
f2 = fingerprint(r2)
print(f"acc={f2['accuracy']}")

same = f1 == f2
print()
print("Run1:", json.dumps(f1))
print("Run2:", json.dumps(f2))
print()
if same:
    print("PASS: runs are bit-identical -> pipeline is deterministic for a fixed seed")
else:
    print("FAIL: nondeterminism detected")
    for k in f1:
        if f1[k] != f2[k]:
            print(f"  {k}: {f1[k]} vs {f2[k]}")
sys.exit(0 if same else 1)

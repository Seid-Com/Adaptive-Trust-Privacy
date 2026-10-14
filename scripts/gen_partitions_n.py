"""
Generate real Dirichlet partitions for arbitrary client counts, in the exact
schema `fl_train_np.load_partition` expects:

    {dataset, alpha, numClients, partitions: [[idx], ...], clientSizes: [n, ...]}

The existing N=20 files use this camelCase schema. Any *_alpha0.5_clientsN.json
that lacks "partitions" (e.g. the N=10/50/100 metadata-only stubs) is a stub and
is regenerated here with real per-client sample indices.

Usage:
    python scripts/gen_partitions_n.py 10 20 50 100
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "preprocessed"
PART_DIR = ROOT / "data" / "partitions"
PART_DIR.mkdir(parents=True, exist_ok=True)

DATASETS = ["TON-IoT", "Edge-IIoTset", "Bot-IoT"]
ALPHA = 0.5
SEED = 42


def dirichlet_partition(y, alpha, K, seed):
    rng = np.random.default_rng(seed)
    partitions = [[] for _ in range(K)]
    for c in np.unique(y):
        idx_c = np.where(y == c)[0]
        rng.shuffle(idx_c)
        props = rng.dirichlet(np.repeat(alpha, K))
        props = (np.cumsum(props) * len(idx_c)).astype(int)
        for k, split in enumerate(np.split(idx_c, props[:-1])):
            partitions[k].extend(split.tolist())
    for k in range(K):
        rng.shuffle(partitions[k])
    return partitions


def main(counts):
    for ds in DATASETS:
        y = np.load(DATA_DIR / f"{ds}_y.npy")
        for K in counts:
            path = PART_DIR / f"{ds}_alpha{ALPHA}_clients{K}.json"
            if path.exists():
                try:
                    d = json.load(open(path))
                    if "partitions" in d and len(d["partitions"]) == K:
                        print(f"[keep] {path.name} already real")
                        continue
                except Exception:
                    pass
            parts = dirichlet_partition(y, ALPHA, K, SEED)
            sizes = [len(p) for p in parts]
            out = {
                "dataset": ds,
                "alpha": ALPHA,
                "numClients": K,
                "partitions": parts,
                "clientSizes": sizes,
            }
            with open(path, "w") as f:
                json.dump(out, f)
            print(
                f"[write] {path.name}  K={K} total={sum(sizes)} "
                f"min={min(sizes)} max={max(sizes)}"
            )


if __name__ == "__main__":
    args = [int(a) for a in sys.argv[1:]] or [10, 20, 50, 100]
    main(args)

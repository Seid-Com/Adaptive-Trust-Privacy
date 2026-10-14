# Trust-Aware Adaptive Differential Privacy for Resource-Constrained Federated Learning in Heterogeneous IoT Environments

**Reproduction code** for the TA-ADP experiments.

A pure-NumPy federated learning pipeline implementing trust-aware client
selection, trust/resource-adaptive Gaussian noise, and client-level
differential privacy (Rényi DP composition), evaluated on three IoT intrusion
detection datasets: **TON-IoT**, **Edge-IIoTset**, and **Bot-IoT**.

Authors: Seid Mehammed Abdu · Dr. Arnab Kumar Biswas · Shakir Khan · Dr. Seid Kassaw

---

## Quick start

```bash
git clone https://github.com/Seid-Com/Adaptive-Trust-Privacy.git
cd Adaptive-Trust-Privacy
pip install -r requirements.txt
python scripts/verify_repro.py        # determinism check (~1 min)
```

Preprocessed data, client partitions, and result JSONs are shipped in
`data/` — no dataset download is needed to inspect results or re-run the
analysis scripts.

---

## 1. Requirements

| Requirement | Version |
|---|---|
| Python | 3.12 (tested) |
| numpy | 2.5.3 |
| pandas, scikit-learn | any recent (preprocessing only) |
| kaggle (optional) | only for automatic dataset download |

```bash
pip install -r requirements.txt          # numpy, pandas, scikit-learn
pip install kaggle                       # optional — dataset download
```

No GPU, database, or Node.js is required for the experiments.

---

## 2. Repository layout

```
├── scripts/                  # all experiment code
│   ├── download_datasets.py  # fetch raw CSVs (Kaggle API)
│   ├── preprocess_datasets.py# raw CSV -> data/preprocessed/*.npy
│   ├── gen_partitions_n.py   # Dirichlet client partitions
│   ├── fl_train_np.py        # core FL trainer (single/multi runs, CLI)
│   ├── run_supp.py           # batch grid runner (ablation, ε-sweep, scale)
│   ├── verify_repro.py       # determinism check (same seed => same result)
│   ├── trust_trajectory.py   # analysis: trust-channel statistics
│   ├── trust_excitation.py   # analysis: attack-conditioned trust
│   ├── render_trust_figures.py      # figures/*.svg
│   └── aggregate_supp.py / summarize_supp.py   # table aggregation
├── data/
│   ├── preprocessed/         # feature/label .npy matrices (shipped)
│   ├── partitions/           # Dirichlet partition JSONs (shipped)
│   ├── results/              # experiment output JSONs (shipped)
│   └── (raw CSVs — NOT shipped, see §3)
├── figures/                  # generated SVG figures
├── .gitignore
├── LICENSE                   # MIT
├── README.md
└── requirements.txt
```

---

## 3. Datasets

Raw CSVs are not stored in the repository (the Edge-IIoTset CSV alone is
~1.2 GB). Two options:

**Option A — automatic download** (needs a Kaggle API key in `~/.kaggle/`):

```bash
python scripts/download_datasets.py
```

**Option B — manual download**, then place files as follows:

| Dataset | File | Place at | Source |
|---|---|---|---|
| TON-IoT | `TON_IoT Network Dataset.csv` | `data/TON-IoT/` | [UNSW](https://research.unsw.edu.au/projects/toniot-datasets) / [Kaggle](https://www.kaggle.com/datasets/arnobbhowmik/ton-iot-network-dataset) |
| Edge-IIoTset | `DNN-EdgeIIoT-dataset.csv` | `data/Edge-IIoTset/` | [Kaggle](https://www.kaggle.com/datasets/mohamedamineferrag/edgeiiotset-cyber-security-dataset-of-iot-iiot) |
| Bot-IoT | `Bot_IoT.csv` | `data/Bot-IoT/` | [UNSW](https://research.unsw.edu.au/projects/bot-iot-dataset) / [Kaggle](https://www.kaggle.com/datasets/vigneshvenkateswaran/bot-iot) |

Preprocessed matrices and partitions are already shipped in `data/` — the
next two steps are only needed to regenerate them from scratch.

---

## 4. Reproduce the experiments

### Step 1 — Preprocess (regenerates `data/preprocessed/*.npy`)

```bash
python scripts/preprocess_datasets.py
```

### Step 2 — Client partitions (regenerates `data/partitions/*.json`)

```bash
python scripts/gen_partitions_n.py 10 20 50 100
```

Dirichlet label split, α = 0.5, partition seed 42.

### Step 3 — Run experiments

**Single configuration** (writes to `data/results/<output>`; one 100-round run
takes ≈ 7–11 min on an 8-core CPU):

```bash
python scripts/fl_train_np.py --dataset TON-IoT --method TA-ADP --attack none --rounds 100 --seeds 5 --clients 20 --alpha 0.5 --no-pooled --output my_run.json
```

All options:

| Flag | Default | Values / meaning |
|---|---|---|
| `--dataset` | all | `TON-IoT` · `Edge-IIoTset` · `Bot-IoT` (omit + `--no-pooled` = all three) |
| `--method` | all | `FedAvg` · `FedAvg+DP` · `FedProx+DP` · `Krum` · `Trimmed Mean` · `FLTrust+DP` · `cosAFed` · `TA-ADP` |
| `--attack` | `none` | `none` · `sign_flip` · `label_flip` · `scaling` |
| `--rounds` | 100 | communication rounds |
| `--seeds` | 5 | number of seeds; seed *i* = 42 + 7*i* (42, 49, 56, 63, 70) |
| `--clients` | 20 | number of FL clients (partition file must exist) |
| `--alpha` | 0.5 | Dirichlet heterogeneity α (partition must match) |
| `--arch` | `mlp` | `mlp` · `cnn` |
| `--sigma-base` | 1.2 | override base noise (noise sweep) |
| `--trust-log` | off | log per-round trust vectors / cosine / poison flags (TA-ADP) |
| `--no-pooled` | off | skip the pooled multi-dataset run |
| `--output` | `verified_results_v2.json` | file name inside `data/results/` |

Runs are resumable: already-completed (dataset, method, attack, seed)
combinations in the output file are skipped.

**Batch grids** (ablation variants, ε-target sweep, N-scalability):

```bash
python scripts/run_supp.py --workers 4        # builds data/results/supp_jobs.json if absent
python scripts/run_supp.py --dry-grid         # inspect the job grid only
```

### Step 4 — Determinism check

```bash
python scripts/verify_repro.py
```

Runs the same configuration twice; prints `PASS` if both runs are
bit-identical (fixed seed ⇒ deterministic pipeline).

### Step 5 — Analysis and figures

```bash
python scripts/trust_trajectory.py     # trust-channel statistics over all results
python scripts/trust_excitation.py     # attack-conditioned trust analysis
python scripts/render_trust_figures.py        # -> figures/*.svg
python scripts/aggregate_supp.py              # aggregate batch results into tables
```

Analysis outputs are written to `data/review/` (created automatically) and
`figures/`.

---

## 5. Shipped results

`data/results/` contains the JSON outputs referenced by the study, including:

| File | Contents |
|---|---|
| `results_ablation.json` | 8 ablation variants × 5 seeds |
| `results_eps_sweep.json` | ε-target sweep |
| `results_scalability.json` | N = 10 / 20 / 50 / 100 |
| `results_trust_excitation.json` | instrumented benign + sign-flip runs (`--trust-log`) |
| `results_noattack_full.json`, `results_label_flip.json`, `results_sign_flip.json`, … | attack evaluations |
| `verified_results_v2.json` | main method-comparison runs |

Every file is regenerable with the commands in §4; seeded runs reproduce the
shipped numbers.

---

## 6. License

MIT — see [LICENSE](LICENSE). © 2026 Seid Mehammed Abdu

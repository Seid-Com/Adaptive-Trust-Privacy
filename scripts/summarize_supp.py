#!/usr/bin/env python3
"""Aggregate supplementary experiment results into summary tables."""
import json, math, sys
import numpy as np
from collections import defaultdict

def load(name):
    try:
        return json.load(open(f"data/results/{name}", encoding="utf-8"))
    except FileNotFoundError:
        return []

def mean_std(vals):
    v = np.array(vals, dtype=float)
    return v.mean(), v.std(ddof=1) if len(v) > 1 else 0.0

print("=" * 70)
print("ABLATION STUDY (pooled, 5 seeds)")
print("=" * 70)
abl = load("results_ablation.json")
order = ["full", "adaptive_sigma_only", "trust_only", "selection_only",
         "no_trust", "no_resource", "no_adaptive_noise", "no_both"]
by = defaultdict(list)
for r in abl:
    by[r["variant"]].append(r["accuracy"] * 100)
if abl:
    ch = {v: by["full"] for v in by}
    full_m = np.mean(by["full"])
    print(f"{'Variant':<22}{'Acc%':>10}{'Std':>8}{'Delta':>9}")
    for v in order:
        if v not in by:
            continue
        m, s = mean_std(by[v])
        print(f"{v:<22}{m:10.2f}{s:8.2f}{m - full_m:9.2f}")
else:
    print("  (in progress)")

print()
print("=" * 70)
print("SCALABILITY — N in {10,20,50,100} (pooled)")
print("=" * 70)
sca = load("results_scalability.json")
sb = defaultdict(list)
for r in sca:
    sb[(r["method"], r["n_clients"])].append(r["accuracy"] * 100)
for n in [10, 20, 50, 100]:
    for meth in ["TA-ADP", "FedAvg+DP"]:
        if (meth, n) in sb:
            m, s = mean_std(sb[(meth, n)])
            print(f"  N={n:<4} {meth:<12} acc={m:6.2f} ± {s:.2f}  eps={max((r['epsilon'] for r in sca if r['method']==meth and r['n_clients']==n), default=-1)}")
print("  (scalability eps: report as measured)")

print()
print("=" * 70)
print("PRIVACY-UTILITY SWEEP — target eps {1..5} (pooled)")
print("=" * 70)
sw = load("results_eps_sweep.json")
eb = defaultdict(list)
for r in sw:
    eb[(r["method"], r["target_eps"])].append(r["accuracy"] * 100)
targets = [1.0, 2.0, 3.0, 4.0, 5.0]
hdr = f"{'Method':<12}" + "".join(f"{'eps=%s'%t:>10}" for t in targets)
print(hdr)
for meth in ["TA-ADP", "FedAvg+DP", "cosAFed"]:
    row = f"{meth:<12}"
    for t in targets:
        if (meth, t) in eb:
            m, s = mean_std(eb[(meth, t)])
            row += f"{m:>8.2f}±"
        else:
            row += f"{'--':>10}"
    print(row)
print("  (each cell = mean accuracy over 3 seeds; σ notes below)")

if sw:
    print("\n  achieved-vs-target ε audit (max per method/target):")
    for meth in ["TA-ADP", "FedAvg+DP", "cosAFed"]:
        line = f"  {meth:<12}"
        for t in targets:
            rows = [r for r in sw if r["method"] == meth and r["target_eps"] == t]
            if rows:
                me = max(r["epsilon"] for r in rows)
                line += f"  {t}->{me:.2f}"
        print(line)
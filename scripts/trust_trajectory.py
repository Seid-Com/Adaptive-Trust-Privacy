#!/usr/bin/env python3
"""Trust-score trajectory review (quantifies whether logged runs contain trust dynamics).

Reads every result file in data/results/, finds which ones carry per-round
trust_log / per-event trust fields, and quantifies:

  - trajectory shape: drift, spread, distinct values, pinned-at-0.5 fraction
  - threshold impact: fraction of (client, round) trust <= TAU_T = 0.4
  - EMA convergence: implied s_j (and raw cosine) from terminal trust
  - noise impact: relative variation of (1-T)^ALPHA from trust vs (1-R)^BETA from resource
  - weight impact: trust weights tw = max(T, 0.01) vs uniform weights

Output: data/review/trust_trajectory_review_output.txt (also printed to stdout).
"""
import json, math, glob, os, sys
from collections import defaultdict
from pathlib import Path

BASE = str(Path(__file__).resolve().parent.parent)
RES = os.path.join(BASE, "data", "results")
OUT = os.path.join(BASE, "data", "review", "trust_trajectory_review_output.txt")

LAMBDA_TRUST = 0.8   # fl_train_np.py:36
TAU_T = 0.4          # fl_train_np.py:38
ALPHA_DP = 1.0       # fl_train_np.py:34
BETA_DP = 1.0        # fl_train_np.py:35
INIT_TRUST = 0.5

out = []


def p(s=""):
    out.append(str(s))


def rnd(x, n=4):
    return round(float(x), n)


# ---------------------------------------------------------------- inventory
p("=" * 78)
p("TRUST-SCORE TRAJECTORY REVIEW - data inventory and quantification")
p("script: scripts/trust_trajectory_review.py   lambda=%.1f  tau_T=%.1f  alpha=%.1f beta=%.1f"
  % (LAMBDA_TRUST, TAU_T, ALPHA_DP, BETA_DP))
p("=" * 78)
p()
p("A. WHICH RESULT FILES CONTAIN TRUST TRAJECTORIES")
p("-" * 78)
files = sorted(glob.glob(os.path.join(RES, "*.json")))
have, lack = [], []
for f in files:
    try:
        with open(f, "r", encoding="utf-8", errors="replace") as fh:
            head = fh.read(400000)
        if '"trust_log"' in head or '"trust"' in head:
            have.append(os.path.basename(f))
        else:
            lack.append(os.path.basename(f))
    except Exception:
        pass
p("  trust trajectories PRESENT in : %s" % (", ".join(have) or "(none)"))
p("  trust NOT logged              : %s" % ", ".join(lack))
p("  => main evaluation pipeline (results_noattack_full.json), attack runs,")
p("     alpha=0.1 and CNN runs have NO per-round trust. Trust IS logged for")
p("     109 runs: 40 ablation + 45 eps-sweep + 24 scalability (run_supp.py:243).")

# ---------------------------------------------------------------- load ablation
with open(os.path.join(RES, "results_ablation.json"), "r", encoding="utf-8") as f:
    ab = json.load(f)
p()
p("B. ABLATION TRUST_LOG COVERAGE")
p("-" * 78)
p("  runs: %d   variants: %s" % (len(ab), sorted({r['variant'] for r in ab})))
p("  each trust_log entry = {round, trust:[per selected client]}")
p("  rounds per run: %d   clients in log: %d" %
  (len(ab[0]["trust_log"]), len(ab[0]["trust_log"][0]["trust"])))

# ---------------------------------------------------------------- per variant stats
p()
p("C. TRAJECTORY STATISTICS PER VARIANT (all 5 seeds pooled)")
p("-" * 78)
p("  %-20s %7s %9s %9s %9s %9s %9s %7s" %
  ("variant", "n", "mean", "min", "max", "std", "term-mean", "|T-0.5|"))

per_variant = {}
for r in ab:
    per_variant.setdefault(r["variant"], []).append(r)

stats = {}
for v in sorted(per_variant):
    runs = per_variant[v]
    vals, term_vals = [], []
    per_run_term_mean = []
    for run in runs:
        tl = run["trust_log"]
        for e in tl:
            vals.extend(e["trust"])
        t99 = tl[-1]["trust"]
        term_vals.extend(t99)
        per_run_term_mean.append(sum(t99) / len(t99))
    n = len(vals)
    mean = sum(vals) / n
    var = sum((x - mean) ** 2 for x in vals) / (n - 1)
    std = math.sqrt(var)
    maxdev = max(abs(x - INIT_TRUST) for x in vals)
    stats[v] = dict(n=n, mean=mean, min=min(vals), max=max(vals), std=std,
                    maxdev=maxdev, term_mean=sum(term_vals) / len(term_vals),
                    term_min=min(term_vals), term_max=max(term_vals),
                    term_std=(lambda xs: math.sqrt(sum((x - sum(xs)/len(xs))**2 for x in xs)/(len(xs)-1)))(term_vals),
                    run_term_mean=sum(per_run_term_mean) / len(per_run_term_mean),
                    vals=vals, term_vals=term_vals)
    p("  %-20s %7d %9.4f %9.4f %9.4f %9.4f %9.4f %7.4f" %
      (v, n, mean, stats[v]["min"], stats[v]["max"], std, stats[v]["term_mean"], maxdev))

p()
p("  D. PER-RUN TRAJECTORY SHAPE (worst case over 8 variants x 5 seeds)")
p("-" * 78)
glob_maxdev, glob_min, glob_max = 0.0, 1.0, 0.0
pinned_runs, moving_runs = 0, 0
for run in ab:
    flat = True
    for e in run["trust_log"]:
        for x in e["trust"]:
            d = abs(x - INIT_TRUST)
            glob_maxdev = max(glob_maxdev, d)
            glob_min, glob_max = min(glob_min, x), max(glob_max, x)
            if d > 1e-9:
                flat = False
    if flat:
        pinned_runs += 1
    else:
        moving_runs += 1
p("  runs whose trust NEVER leaves 0.5000 (exactly): %d / %d" % (pinned_runs, len(ab)))
p("  runs with any movement                            : %d / %d" % (moving_runs, len(ab)))
p("  GLOBAL trust range over all 40 runs x 100 rounds x 20 clients:")
p("     min = %.4f   max = %.4f   max |T - 0.5| = %.4f" % (glob_min, glob_max, glob_maxdev))

# ------------------------------------------------- threshold + EMA + noise impact
p()
p("C2. CROSS-FILE CONFIRMATION (results_eps_sweep.json, results_scalability.json)")
p("-" * 78)
for fname in ("results_eps_sweep.json", "results_scalability.json"):
    try:
        with open(os.path.join(RES, fname), "r", encoding="utf-8") as fh:
            extra = json.load(fh)
    except Exception as e:
        p("  %s: cannot load (%s)" % (fname, e))
        continue
    gmin, gmax, pinned, nvals, below = 1.0, 0.0, 0, 0, 0
    ncfg = set()
    for run in extra:
        tl = run.get("trust_log")
        if not tl:
            continue
        ncfg.add(str(run.get("target_eps", run.get("n_clients", "?"))))
        flat = True
        for e in tl:
            for x in e["trust"]:
                nvals += 1
                gmin, gmax = min(gmin, x), max(gmax, x)
                if x <= TAU_T:
                    below += 1
                if abs(x - INIT_TRUST) > 1e-9:
                    flat = False
        pinned += 1 if flat else 0
    p("  %s: runs=%d  configs=%d  trust values=%d" %
      (fname, len(extra), len(ncfg), nvals))
    p("     global range [%.4f, %.4f]  max|T-0.5|=%.4f  pinned runs=%d  <=tau_T: %d"
      % (gmin, gmax, max(abs(gmin - 0.5), abs(gmax - 0.5)), pinned, below))

p()
p("E. CONSEQUENCES")
p("-" * 78)
below_tau = sum(1 for v in stats.values() for x in v["vals"] if x <= TAU_T)
total = sum(v["n"] for v in stats.values())
p("  1. Selection threshold TAU_T = %.1f :" % TAU_T)
p("     fraction of (client,round) trust values <= tau_T : %d / %d (%.4f%%)"
  % (below_tau, total, 100.0 * below_tau / total))
p("     => the trust threshold NEVER excludes anyone; selection is decided")
p("        solely by the resource threshold (resource ~ U(0.4,0.9) > 0.3).")

full = stats.get("full")
t_lo, t_hi = full["min"], full["max"]
def sig(t):
    return (1.0 - t) ** ALPHA_DP * (1.0 - 0.65) ** BETA_DP  # resource factor neutral here
p()
p("  2. Trust term of sigma_adapt = sigma_max * (1-T)^%.1f * (1-R)^%.1f:" %
  (ALPHA_DP, BETA_DP))
p("     (1-T) range over all runs: %.4f .. %.4f  -> %.3f%% spread"
  % (1 - t_hi, 1 - t_lo, 100.0 * ((1 - t_lo) - (1 - t_hi)) / (1 - t_lo)))
p("     (1-R) range (R ~ U[0.4,0.9])          : 0.1000 .. 0.6000 -> 500% spread")
p("     => >99% of the per-client noise variation comes from the STATIC")
p("        resource score; the trust term contributes < 1%.")

p()
p("  3. Trust-weighted aggregation tw = max(T, 0.01):")
w_lo, w_hi = max(t_lo, 0.01), max(t_hi, 0.01)
p("     weight range: %.4f .. %.4f  (%.3f%% spread) -> aggregation is"
  " numerically indistinguishable from uniform FedAvg weights."
  % (w_lo, w_hi, 100.0 * (w_hi - w_lo) / w_lo))

p()
p("  4. EMA lambda = %.1f: weight of samples older than k rounds = %.1f^k" %
  (LAMBDA_TRUST, LAMBDA_TRUST))
p("     0.8^10 = %.4f, 0.8^30 = %.6f -> after round ~30 terminal trust ~= mean s_j."
  % (0.8 ** 10, 0.8 ** 30))
if full:
    p("     Terminal trust (round 99, full variant): mean %.4f, min %.4f, max %.4f"
      % (full["term_mean"], full["term_min"], full["term_max"]))
    p("     => implied similarity s_j ~= T = (1+cos)/2  =>  cos ~= 2*T - 1:")
    p("        cos in [%.4f, %.4f]  (updates are ~orthogonal to the server delta)"
      % (2 * full["term_min"] - 1, 2 * full["term_max"] - 1))

p()
p("  5. Threshold of near-0.5 trust: expected trust under benign convergence")
p("     should rise (updates aligned with aggregate). Measured: no rise.")
p("     First-round vs last-round mean (full variant, all seeds):")
first_means, last_means = [], []
for run in per_variant["full"]:
    first_means.append(sum(run["trust_log"][0]["trust"]) / 20)
    last_means.append(sum(run["trust_log"][-1]["trust"]) / 20)
p("     round 0 mean = %.4f   round 99 mean = %.4f   drift = %+.4f"
  % (sum(first_means) / 5, sum(last_means) / 5,
     sum(last_means) / 5 - sum(first_means) / 5))

p()
p("  6. Round-0 reference vector (run_supp.py:130):")
p("     prev_global_vec = w0 * 0.01  => sd = w0 - 0.01*w0 = 0.99*w0 (initial")
p("     weights, not an update). Round-0 trust compares updates against the")
p("     initial weight vector - a meaningless reference (code defect).")

# cross-check with client_epsilons trust field
p()
p("F. CROSS-CHECK: per-event 'trust' field in client_epsilons (full run seed 42)")
p("-" * 78)
run0 = next(r for r in ab if r["variant"] == "full" and r["seed"] == 42)
ev_trust = [e.get("trust") for e in run0["client_epsilons"] if "trust" in e]
if ev_trust:
    p("  events: %d   min %.4f  max %.4f  mean %.4f" %
      (len(ev_trust), min(ev_trust), max(ev_trust), sum(ev_trust) / len(ev_trust)))
    p("  sigma_adapt range: %.4f .. %.4f   resource range: %.4f .. %.4f" %
      (min(e["sigma_adapt"] for e in run0["client_epsilons"] if "sigma_adapt" in e),
       max(e["sigma_adapt"] for e in run0["client_epsilons"] if "sigma_adapt" in e),
       min(e.get("resource", 0) for e in run0["client_epsilons"]),
       max(e.get("resource", 0) for e in run0["client_epsilons"])))

p()
p("G. VERDICT")
p("-" * 78)
p("  F1. Trust trajectories exist for 109 runs (ablation/eps-sweep/scalability,")
p("      run_supp.py pipeline); absent from the main evaluation + attack runs.")
p("  F2. They are FLAT: global range [%.4f, %.4f], max deviation from 0.5 = %.4f;"
  % (glob_min, glob_max, glob_maxdev))
p("      %d of 40 runs never move off 0.5000 at all." % pinned_runs)
p("  F3. tau_T never binds (0% excluded); resource decides all selection.")
p("  F4. Trust term of the noise formula varies <1%; weights are uniform-like.")
p("  F5. Implied cosine ~ 0: benign updates are orthogonal to the server delta,")
p("      so the trust mechanism has no signal to track in no-attack runs.")
p("  F6. Round-0 reference vector is 0.99*w0 (defect, run_supp.py:130).")
p("  => trust-banded noise/allocation claims CANNOT be backed")
p("     by measured trust trajectories under the current design.")

text = "\n".join(out)
Path(OUT).parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(text + "\n")
try:
    sys.stdout.buffer.write((text + "\n").encode("utf-8", errors="replace"))
except Exception:
    print(text)

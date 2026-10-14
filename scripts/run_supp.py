#!/usr/bin/env python3
"""
Supplementary TA-ADP experiments (pooled / aggregate setting), pure numpy.

Produces real measurements for the supplementary grids:

  1) ablation study (8 variants)   -> results_ablation.json
  2) scalability  N in {10,20,50,100} x {TA-ADP, FedAvg+DP}
                 -> results_scalability.json
  3) privacy-utility sweep, epsilon target in {1,2,3,4,5}
                 x {TA-ADP, FedAvg+DP, cosAFed} -> results_eps_sweep.json

Design notes
------------
- Reuses the verified helpers (load_dataset, load_partition, NumpyMLP, RDP
  accountant, cosine_sim, ...) from fl_train_np so numbers stay comparable.
- The full TA-ADP configuration in cfg == defaults reproduces run_pooled's
  TA-ADP path exactly (sanity: pooled TA-ADP seed 42 == 0.9030, eps=6.30).
- Each (job) record is saved incrementally (resume-safe).
- Parallel over 4 worker processes.

Ablation knobs (cfg dict), defaults match FULL TA-ADP:
    use_trust          : trust EMA from cosine similarity + trust-based weights
    use_resource       : resource levels (static uniform 0.4..0.9) in sigma_adapt
    adaptive_noise     : sigma_adapt = sigma_max*(1-T)^a*(1-R)^b ; else sigma_max/2
    adaptive_selection : threshold (R>TAU_R and T>TAU_T) ; else 30% random
Ablation matrix:
    ["full", "adaptive_sigma_only", "trust_only", "selection_only",
     "no_trust", "no_resource", "no_adaptive_noise", "no_both"]

For privacy-utility sweep, sigma_base/sigma_max are scaled so the MAXIMUM
per-client per-round epsilon (worst-case, delta=1e-5, RDP order 16) equals the
target epsilon (bisection on the accountant only - no training).
"""

import argparse, json, math, os, sys, time
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import fl_train_np as F

OUT_DIR = F.OUT_DIR
DATASETS = F.DATASETS


# ---------------------------------------------------------------------------
# job index: deterministic grid description
# ---------------------------------------------------------------------------
ABLATIONS = ["full", "adaptive_sigma_only", "trust_only", "selection_only",
             "no_trust", "no_resource", "no_adaptive_noise", "no_both"]

ABLATION_CFG = {
    "full":                dict(use_trust=True,  use_resource=True,  adaptive_noise=True,  adaptive_selection=True),
    "adaptive_sigma_only": dict(use_trust=False, use_resource=False, adaptive_noise=True,  adaptive_selection=True),
    "trust_only":          dict(use_trust=True,  use_resource=False, adaptive_noise=False, adaptive_selection=True),
    "selection_only":      dict(use_trust=False, use_resource=False, adaptive_noise=True,  adaptive_selection=False),
    "no_trust":            dict(use_trust=False, use_resource=True,  adaptive_noise=True,  adaptive_selection=True),
    "no_resource":         dict(use_trust=True,  use_resource=False, adaptive_noise=True,  adaptive_selection=True),
    "no_adaptive_noise":   dict(use_trust=True,  use_resource=True,  adaptive_noise=False, adaptive_selection=True),
    "no_both":             dict(use_trust=False, use_resource=False, adaptive_noise=False, adaptive_selection=True),
}


def sigma_for_epsilon(target_eps, use_adapt_min=True, cap=6.8):
    """Bisect sigma_base so worst-case per-client per-round epsilon == target.

    worst-case epsilon uses the smallest sigma_eff, i.e. sigma_adapt=0
    (sigma_eff=sigma_base). h(s)= 16/(2 s^2) + ln(1e5)/15.
    """
    hi, lo = cap, 0.05
    for _ in range(200):
        mid = 0.5 * (hi + lo)
        e = F.rdp_to_dp(F.client_rdp_epsilon(mid, F.CLIP_NORM, F.RDP_ORDER), F.RDP_ORDER, F.DELTA)
        if e > target_eps:
            lo = mid
        else:
            hi = mid
    return 0.5 * (hi + lo)


# ---------------------------------------------------------------------------
# pooled experiment with configurable TA-ADP / sigma scaling
# ---------------------------------------------------------------------------
def run_pooled_cfg(method, seed, n_clients, rounds, cfg, arch="mlp"):
    """Generalized pooled run. method in {TA-ADP, FedAvg+DP, cosAFed}."""
    rng = np.random.default_rng(seed)
    all_X, all_y, all_partitions, all_sizes, offset = [], [], [], [], 0
    max_features = 0
    for dname in DATASETS:
        X, y = F.load_dataset(dname)
        max_features = max(max_features, X.shape[1])
        all_X.append(X); all_y.append(y)
        p, s = F.load_partition(dname, 0.5, n_clients)
        all_partitions.append([(np.array(idx) + offset) for idx in p])
        all_sizes.append(s)
        offset += len(X)

    padded_X, adjusted_y, offset_y = [], [], 0
    for X, y in zip(all_X, all_y):
        if X.shape[1] < max_features:
            pad = np.zeros((len(X), max_features - X.shape[1]), dtype=X.dtype)
            padded_X.append(np.concatenate([X, pad], axis=1))
        else:
            padded_X.append(X)
        adjusted_y.append(y + offset_y)
        offset_y += int(y.max()) + 1

    X_all = np.concatenate(padded_X); y_all = np.concatenate(adjusted_y)
    n_features = X_all.shape[1]; n_classes = int(y_all.max()) + 1

    client_data, test_data = [], []
    for i in range(n_clients):
        idx = np.concatenate([all_partitions[pi][i] for pi in range(len(all_partitions))])
        rng.shuffle(idx)
        split = int(0.8 * len(idx))
        client_data.append((X_all[idx[:split]], y_all[idx[:split]]))
        test_data.append((X_all[idx[split:]], y_all[idx[split:]]))
    X_test = np.concatenate([d[0] for d in test_data])
    y_test = np.concatenate([d[1] for d in test_data])
    client_sizes = [d[0].shape[0] for d in client_data]

    ModelCls = F.NumpyCNN1D if arch == "cnn" else F.NumpyMLP
    global_model = ModelCls(n_features, n_classes, rng)
    global_vec = global_model.to_vector()
    trust_scores = np.full(n_clients, 0.5)
    resource_scores = rng.uniform(0.4, 0.9, size=n_clients)
    client_epsilons = []
    prev_global_vec = global_model.to_vector() * 0.01
    metrics_log = []
    trust_log = []

    sigma_base = cfg.get("sigma_base", F.SIGMA_BASE)
    sigma_max = cfg.get("sigma_max", F.SIGMA_MAX)

    for t in range(rounds):
        if method in ("TA-ADP", "cosAFed"):
            use_thresh = cfg.get("adaptive_selection", True) if method == "TA-ADP" else True
            if use_thresh:
                selected = [i for i in range(n_clients)
                            if resource_scores[i] > F.TAU_R and trust_scores[i] > F.TAU_T]
                if len(selected) < 3:
                    selected = list(rng.choice(n_clients, size=min(3, n_clients), replace=False))
            else:
                frac = min(0.3, 10.0 / n_clients)
                n_sel = max(3, int(n_clients * frac))
                selected = list(rng.choice(n_clients, size=min(n_sel, n_clients), replace=False))
                selected = sorted(selected)
        else:
            # mirror fl_train_np.py: non-threshold methods select ~30% (min 3)
            if cfg.get("all_clients", False):
                selected = list(range(n_clients))
            else:
                frac = min(0.3, 10.0 / n_clients)
                n_sel = max(3, int(n_clients * frac))
                selected = list(rng.choice(n_clients, size=min(n_sel, n_clients), replace=False))
                selected = sorted(selected)

        updates, sel_sizes = [], []
        for ci in selected:
            local_model = ModelCls.from_vector(global_vec, n_features, n_classes, rng)
            X_c, y_c = client_data[ci]; n_c = len(X_c)
            for ep in range(F.LOCAL_EPOCHS):
                perm = rng.permutation(n_c)
                for start in range(0, n_c, F.BATCH_SIZE):
                    bidx = perm[start:start + F.BATCH_SIZE]
                    if len(bidx) < 2 or len(np.unique(y_c[bidx])) < 2:
                        continue
                    local_model.train_step(X_c[bidx], y_c[bidx],
                                           F.CNN_LR if arch == "cnn" else F.LR, None, 0.0)
            delta = local_model.to_vector() - global_vec
            if method in ("FedAvg+DP", "cosAFed", "TA-ADP"):
                delta = F.clip_update(delta, F.CLIP_NORM)
            updates.append(delta)
            sel_sizes.append(client_sizes[ci])

        if len(updates) == 0:
            metrics_log.append({"round": t, "accuracy": 0.0})
            continue

        if method in ("FedAvg+DP", "cosAFed"):
            # both use size-weighted averaging + fixed adaptive noise, matching
            # fl_train_np.py; they differ in SELECTION (cosAFed uses thresholds).
            se = F.compute_effective_noise(sigma_base, sigma_max * 0.3)
            for ci in selected:
                ep = F.rdp_to_dp(F.client_rdp_epsilon(se, F.CLIP_NORM, F.RDP_ORDER), F.RDP_ORDER, F.DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(se, 4), "epsilon": round(ep, 4)})
            agg_delta = F.fedavg(updates, sel_sizes)
            agg_delta += rng.normal(0, se / math.sqrt(len(selected)), size=agg_delta.shape)
        elif method == "TA-ADP":
            sd = global_vec - prev_global_vec
            tw, sigmas, tr_log = np.zeros(len(updates)), [], np.zeros(len(updates))
            for j, (upd, ci) in enumerate(zip(updates, selected)):
                if cfg.get("use_trust", True):
                    cr = F.cosine_sim(upd, sd)
                    sj = (1.0 + cr) / 2.0
                    trust_scores[ci] = F.LAMBDA_TRUST * trust_scores[ci] + (1.0 - F.LAMBDA_TRUST) * sj
                else:
                    trust_scores[ci] = 0.5
                tw[j] = max(trust_scores[ci], 0.01)
                rj = resource_scores[ci] if cfg.get("use_resource", True) else 0.5
                if cfg.get("adaptive_noise", True):
                    sa = F.compute_adapt_noise(sigma_max, trust_scores[ci], rj, F.ALPHA_DP, F.BETA_DP)
                else:
                    sa = sigma_max / 2.0
                sigmas.append(sa)
                se = F.compute_effective_noise(sigma_base, sa)
                ep = F.rdp_to_dp(F.client_rdp_epsilon(se, F.CLIP_NORM, F.RDP_ORDER), F.RDP_ORDER, F.DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(se, 4),
                                        "epsilon": round(ep, 4), "trust": round(trust_scores[ci], 4),
                                        "resource": round(rj, 4), "sigma_adapt": round(sa, 4)})
                tr_log[j] = trust_scores[ci]
            trust_log.append({"round": t, "trust": tr_log.tolist()})
            tw_s = tw.sum()
            agg_delta = np.zeros_like(global_vec)
            for j, upd in enumerate(updates):
                agg_delta += upd * (tw[j] / tw_s)
            avg_s = np.mean(sigmas)
            sn = F.compute_effective_noise(sigma_base, avg_s) / math.sqrt(len(selected))
            agg_delta += rng.normal(0, sn, size=agg_delta.shape)
        else:
            raise ValueError(method)

        prev_global_vec = global_vec.copy()
        global_vec = global_vec + F.LR * agg_delta

        if t % 10 == 0 or t == rounds - 1:
            m_mod = ModelCls.from_vector(global_vec, n_features, n_classes, rng)
            yp = m_mod.predict(X_test)
            a, p, r, mf, wf = F.macro_metrics(y_test, yp, n_classes)
            metrics_log.append({"round": t, "accuracy": round(a, 4)})

    fm = ModelCls.from_vector(global_vec, n_features, n_classes, rng)
    yp = fm.predict(X_test)
    a, p, r, mf, wf = F.macro_metrics(y_test, yp, n_classes)
    me = max((e["epsilon"] for e in client_epsilons), default=0.0)
    return {
        "dataset": "pooled", "method": method, "attack": "none", "seed": seed,
        "accuracy": round(a, 4), "precision": round(p, 4), "recall": round(r, 4),
        "macro_f1": round(mf, 4), "weighted_f1": round(wf, 4),
        "epsilon": round(me, 2), "metrics_log": metrics_log,
        "client_epsilons": client_epsilons, "trust_log": trust_log,
        "variant": cfg.get("variant"), "n_clients": n_clients,
        "target_eps": cfg.get("target_eps"), "arch": arch,
    }


# ---------------------------------------------------------------------------
# job grid + resumable parallel runner
# ---------------------------------------------------------------------------
def build_jobs(jobs_file):
    jobs = []

    # 1) ablation: 8 variants x 5 seeds
    for variant, cfg_core in ABLATION_CFG.items():
        for seed in [42, 49, 56, 63, 70]:
            cfg = dict(cfg_core, variant=variant)
            jobs.append({"out": "results_ablation.json", "method": "TA-ADP",
                         "seed": seed, "n_clients": 20, "rounds": 100, "cfg": cfg})

    # 2) scalability: N x methods x 3 seeds
    for n_clients in [10, 20, 50, 100]:
        for method in ["TA-ADP", "FedAvg+DP"]:
            for seed in [42, 49, 56]:
                jobs.append({"out": "results_scalability.json", "method": method,
                             "seed": seed, "n_clients": n_clients, "rounds": 100,
                             "cfg": {"variant": "scalability"}})

    # 3) privacy-utility sweep: eps target x methods x 3 seeds
    for target in [1.0, 2.0, 3.0, 4.0, 5.0]:
        for method in ["TA-ADP", "FedAvg+DP", "cosAFed"]:
            sb = sigma_for_epsilon(target)
            sm = sb * (F.SIGMA_MAX / F.SIGMA_BASE)
            for seed in [42, 49, 56]:
                cfg = {"variant": "eps_sweep", "target_eps": target,
                       "sigma_base": sb, "sigma_max": sm}
                jobs.append({"out": "results_eps_sweep.json", "method": method,
                             "seed": seed, "n_clients": 20, "rounds": 100, "cfg": cfg})

    with open(jobs_file, "w") as f:
        json.dump(jobs, f, indent=1)
    print(f"wrote {len(jobs)} jobs to {jobs_file}")
    return jobs


def job_key(j):
    return (j["out"], j["method"], j["seed"], j["n_clients"],
            j["cfg"].get("variant"), j["cfg"].get("target_eps"))


def already_done(results, j):
    return any(r["method"] == j["method"] and r["seed"] == j["seed"]
               and r["n_clients"] == j["n_clients"]
               and r.get("variant") == j["cfg"].get("variant")
               and r.get("target_eps") == j["cfg"].get("target_eps")
               for r in results)


def run_job(j):
    r = run_pooled_cfg(j["method"], j["seed"], j["n_clients"], j["rounds"], j["cfg"])
    r["variant"] = j["cfg"].get("variant")
    r["target_eps"] = j["cfg"].get("target_eps")
    r["out"] = j["out"]
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", default=str(OUT_DIR / "supp_jobs.json"))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--only", default=None, help="restrict to out filename")
    ap.add_argument("--dry-grid", action="store_true")
    args = ap.parse_args()

    jobs_file = Path(args.jobs)
    if not jobs_file.exists():
        build_jobs(jobs_file)
    jobs = json.load(open(jobs_file))
    if args.only:
        jobs = [j for j in jobs if j["out"] == args.only]

    from multiprocessing import Pool
    out_files = sorted({j["out"] for j in jobs})
    state = {}
    for of in out_files:
        p = OUT_DIR / of
        state[of] = json.load(open(p)) if p.exists() else []

    pending = [j for j in jobs if not already_done(state[j["out"]], j)]
    print(f"{len(jobs)} jobs, {len(pending)} pending across {out_files}")

    if args.dry_grid:
        return

    if not pending:
        print("nothing pending")
        return

    def _load():
        return {of: json.load(open(OUT_DIR / of)) for of in out_files}

    def _save(of, results):
        tmp = OUT_DIR / (of + ".tmp")
        with open(tmp, "w") as f:
            json.dump(results, f, indent=1, cls=F.NumpyEncoder)
        os.replace(tmp, OUT_DIR / of)

    t_start = time.time()
    with Pool(args.workers) as pool:
        done_n = 0
        for res in pool.imap_unordered(run_job, pending):
            of = res["out"]
            if "out" in res:
                del res["out"]
            results = state[of]
            # prevent duplicate on restart
            results = [r for r in results
                       if not (r["method"] == res["method"] and r["seed"] == res["seed"]
                               and r["n_clients"] == res["n_clients"]
                               and r.get("variant") == res.get("variant")
                               and r.get("target_eps") == res.get("target_eps"))]
            results.append(res)
            _save(of, results)
            state[of] = results
            done_n += 1
            eta = (time.time() - t_start) / done_n * (len(pending) - done_n)
            print(f"[{done_n}/{len(pending)}] {res['method']} seed={res['seed']} "
                  f"N={res['n_clients']} v={res.get('variant')} eps_t={res.get('target_eps')} "
                  f"acc={res['accuracy']:.4f} eps={res['epsilon']:.2f} ETA={eta/60:.0f}min", flush=True)

    print("DONE in %.1f min" % ((time.time() - t_start) / 60))


if __name__ == "__main__":
    main()
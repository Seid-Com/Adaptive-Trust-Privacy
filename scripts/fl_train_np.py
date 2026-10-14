#!/usr/bin/env python3
"""
TA-ADP FL Training Pipeline — pure numpy MLP (no PyTorch/sklearn training).

Implements:
  - FedAvg, FedAvg+DP, FedProx+DP, Krum, Trimmed Mean,
    FLTrust+DP, cosAFed, TA-ADP
  - Sign-flip, label-flip, scaling poisoning attacks
  - Client-level RDP accounting with per-client epsilon
  - 5 independent seeds for std-dev estimates
  - 100 communication rounds, 20 clients, Dirichlet non-IID

Usage:
  python fl_train_np.py [--rounds 100] [--seeds 5] [--clients 20]
"""

import argparse, json, os, sys, time, math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "preprocessed"
PART_DIR = ROOT / "data" / "partitions"
OUT_DIR  = ROOT / "data" / "results"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DATASETS = ["TON-IoT", "Edge-IIoTset", "Bot-IoT"]
METHODS  = ["FedAvg", "FedAvg+DP", "FedProx+DP", "Krum", "Trimmed Mean",
            "FLTrust+DP", "cosAFed", "TA-ADP"]

SIGMA_BASE = 1.2
SIGMA_MAX  = 1.5
CLIP_NORM  = 1.0
ALPHA_DP   = 1.0
BETA_DP    = 1.0
LAMBDA_TRUST = 0.8
TAU_R = 0.3
TAU_T = 0.4
DELTA = 1e-5
RDP_ORDER = 16
LOCAL_EPOCHS = 3
BATCH_SIZE = 256
LR = 0.01
CNN_LR = 0.05
HIDDEN_DIMS = [38, 128, 64, 10]

def relu(x):
    return np.maximum(0, x)

def relu_deriv(x):
    return (x > 0).astype(np.float64)

def softmax(x):
    e = np.exp(x - x.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)

def cross_entropy_loss_and_grad(y_pred, y_true, n_classes):
    N = len(y_true)
    y_onehot = np.zeros((N, n_classes), dtype=np.float64)
    y_onehot[np.arange(N), y_true] = 1.0
    loss = -np.mean(np.sum(y_onehot * np.log(y_pred + 1e-12), axis=1))
    grad = (y_pred - y_onehot) / N
    return loss, grad

class NumpyMLP:
    """Simple 2-hidden-layer MLP in pure numpy."""
    def __init__(self, n_features, n_classes, rng, hidden1=128, hidden2=64):
        self.n_features = n_features
        self.n_classes = n_classes
        scale1 = np.sqrt(2.0 / n_features)
        scale2 = np.sqrt(2.0 / hidden1)
        scale3 = np.sqrt(2.0 / hidden2)
        self.W1 = rng.standard_normal((n_features, hidden1)) * scale1
        self.b1 = np.zeros(hidden1)
        self.W2 = rng.standard_normal((hidden1, hidden2)) * scale2
        self.b2 = np.zeros(hidden2)
        self.W3 = rng.standard_normal((hidden2, n_classes)) * scale3
        self.b3 = np.zeros(n_classes)

    def forward(self, X):
        self.z1 = X @ self.W1 + self.b1
        self.a1 = relu(self.z1)
        self.z2 = self.a1 @ self.W2 + self.b2
        self.a2 = relu(self.z2)
        self.z3 = self.a2 @ self.W3 + self.b3
        self.a3 = softmax(self.z3)
        return self.a3

    def to_vector(self):
        return np.concatenate([self.W1.ravel(), self.b1, self.W2.ravel(), self.b2,
                               self.W3.ravel(), self.b3])

    @classmethod
    def from_vector(cls, vec, n_features, n_classes, rng, hidden1=128, hidden2=64):
        m = cls(n_features, n_classes, rng, hidden1, hidden2)
        idx = 0
        s = m.W1.size; m.W1 = vec[idx:idx+s].reshape(m.W1.shape); idx += s
        s = m.b1.size; m.b1 = vec[idx:idx+s].copy(); idx += s
        s = m.W2.size; m.W2 = vec[idx:idx+s].reshape(m.W2.shape); idx += s
        s = m.b2.size; m.b2 = vec[idx:idx+s].copy(); idx += s
        s = m.W3.size; m.W3 = vec[idx:idx+s].reshape(m.W3.shape); idx += s
        s = m.b3.size; m.b3 = vec[idx:idx+s].copy(); idx += s
        return m

    def train_step(self, X_batch, y_batch, lr, global_vec=None, mu=0.0):
        N = len(y_batch)
        y_pred = self.forward(X_batch)
        _, grad_out = cross_entropy_loss_and_grad(y_pred, y_batch, self.n_classes)
        dz3 = grad_out
        dW3 = self.a2.T @ dz3
        db3 = dz3.sum(axis=0)
        da2 = dz3 @ self.W3.T
        dz2 = da2 * relu_deriv(self.z2)
        dW2 = self.a1.T @ dz2
        db2 = dz2.sum(axis=0)
        da1 = dz2 @ self.W2.T
        dz1 = da1 * relu_deriv(self.z1)
        dW1 = X_batch.T @ dz1
        db1 = dz1.sum(axis=0)
        if global_vec is not None and mu > 0:
            idx = 0
            s = self.W1.size; gW1 = global_vec[idx:idx+s].reshape(self.W1.shape); idx += s
            s = self.b1.size; gb1 = global_vec[idx:idx+s]; idx += s
            s = self.W2.size; gW2 = global_vec[idx:idx+s].reshape(self.W2.shape); idx += s
            s = self.b2.size; gb2 = global_vec[idx:idx+s]; idx += s
            s = self.W3.size; gW3 = global_vec[idx:idx+s].reshape(self.W3.shape); idx += s
            s = self.b3.size; gb3 = global_vec[idx:idx+s]; idx += s
            dW1 += mu * (self.W1 - gW1)
            db1 += mu * (self.b1 - gb1)
            dW2 += mu * (self.W2 - gW2)
            db2 += mu * (self.b2 - gb2)
            dW3 += mu * (self.W3 - gW3)
            db3 += mu * (self.b3 - gb3)
        self.W3 -= lr * dW3
        self.b3 -= lr * db3
        self.W2 -= lr * dW2
        self.b2 -= lr * db2
        self.W1 -= lr * dW1
        self.b1 -= lr * db1

    def predict(self, X):
        probs = self.forward(X)
        return probs.argmax(axis=1)

    def predict_proba(self, X):
        return self.forward(X)

class NumpyCNN1D:
    """1D-ConvNet in pure numpy. Treats tabular features as a 1D signal.

    Conv1D(16, k=3) -> ReLU -> MaxPool(2) -> Conv1D(32, k=3) -> ReLU ->
    GlobalAvgPool -> Dense(64) -> softmax. Vector layout mirrors NumpyMLP so
    it plugs into the same FL aggregation routines and DP/trust accounting.
    """
    def __init__(self, n_features, n_classes, rng, hidden1=128, hidden2=64):
        self.n_features = n_features
        self.n_classes = n_classes
        self.f1, self.f2, self.k = 8, 16, 3
        self.pad = self.k // 2
        self.scale = np.sqrt(2.0 / float(self.k + 1))
        self.W1 = rng.standard_normal((self.f1, 1, self.k)) * self.scale
        self.b1 = np.zeros(self.f1)
        self.W2 = rng.standard_normal((self.f2, self.f1, self.k)) * self.scale
        self.b2 = np.zeros(self.f2)
        self.W3 = rng.standard_normal((self.f2, hidden1)) * np.sqrt(2.0 / self.f2)
        self.b3 = np.zeros(hidden1)
        self.W4 = rng.standard_normal((hidden1, n_classes)) * np.sqrt(2.0 / hidden1)
        self.b4 = np.zeros(n_classes)

    def _conv_forward(self, X, W, b):
        # X: (N, Cin, L) zero-padded; W: (Fout, Cin, k)
        from numpy.lib.stride_tricks import sliding_window_view
        N, Cin, L = X.shape
        k = W.shape[2]
        Lo = L - k + 1
        win = sliding_window_view(X, k, axis=2)          # (N, Cin, Lo, k)
        out = np.einsum("nclk,ock->nlo", win, W)
        return out.transpose(0, 2, 1) + b[None, :, None]

    def forward(self, X):
        N = X.shape[0]
        self._N = N
        self._Xin = X.astype(np.float64)
        if X.ndim == 3:
            self._Xp = np.pad(self._Xin, ((0, 0), (0, 0), (self.pad, self.pad)))
        else:
            self._Xp = np.pad(self._Xin[:, None, :], ((0, 0), (0, 0), (self.pad, self.pad)))
        z1 = self._conv_forward(self._Xp, self.W1, self.b1)
        self._z1, self._a1 = z1, relu(z1)
        L = self._a1.shape[2]
        self._Lp = L // 2
        a1r = self._a1[:, :, :self._Lp * 2].reshape(N, self.f1, self._Lp, 2)
        self._pool_idx = a1r.argmax(axis=3)
        self._a2 = a1r.max(axis=3)
        self._Xp2 = np.pad(self._a2, ((0, 0), (0, 0), (self.pad, self.pad)))
        z2 = self._conv_forward(self._Xp2, self.W2, self.b2)
        self._z2, self._a3 = z2, relu(z2)
        self._gap = self._a3.mean(axis=2)
        self._z3 = self._gap @ self.W3 + self.b3
        self._a4 = relu(self._z3)
        z4 = self._a4 @ self.W4 + self.b4
        self._out = softmax(z4)
        return self._out

    def _conv_backward(self, dZ, Xpad, W):
        from numpy.lib.stride_tricks import sliding_window_view
        N, Fout, Lo = dZ.shape
        k = W.shape[2]
        dW = np.einsum("nol,nclk->ock", dZ, sliding_window_view(Xpad, k, axis=2))
        db = dZ.sum(axis=(0, 2))
        dXp = np.zeros_like(Xpad)
        Cin = W.shape[1]
        for kk in range(k):
            # dXp[:, :, kk:kk+Lo] += sum_o dZ[:, o, :] * W[o, :, kk]
            dXp[:, :, kk:kk + Lo] += np.einsum("nol,oc->ncl", dZ, W[:, :, kk].reshape(W.shape[0], -1))
        return dW, db, dXp

    def train_step(self, X_batch, y_batch, lr, global_vec=None, mu=0.0):
        N = len(y_batch)
        probs = self.forward(X_batch)
        _, d = cross_entropy_loss_and_grad(probs, y_batch, self.n_classes)
        dW4 = self._a4.T @ d
        db4 = d.sum(axis=0)
        da4 = d @ self.W4.T
        dz3 = da4 * relu_deriv(self._z3)
        dW3 = self._gap.T @ dz3
        db3 = dz3.sum(axis=0)
        dgap = dz3 @ self.W3.T
        dz2 = (dgap[:, :, None] / self._a3.shape[2]) * relu_deriv(self._z2)
        dW2, db2, dXp2 = self._conv_backward(dz2, self._Xp2, self.W2)
        da2 = dXp2[:, :, self.pad:-self.pad]
        a1r = self._a1[:, :, :self._Lp * 2].reshape(N, self.f1, self._Lp, 2)
        gA1r = np.zeros_like(a1r)
        rr = np.arange(N)[:, None, None]
        cc = np.arange(self.f1)[None, :, None]
        pp = np.arange(self._Lp)[None, None, :]
        gA1r[rr, cc, pp, self._pool_idx] = da2
        gA1_full = gA1r.reshape(N, self.f1, self._Lp * 2)
        dz1 = gA1_full * relu_deriv(self._z1)
        dW1, db1, _ = self._conv_backward(dz1, self._Xp, self.W1)

        if global_vec is not None and mu > 0:
            idx = 0
            params = [(self.W1, self.b1, dW1, db1), (self.W2, self.b2, dW2, db2),
                      (self.W3, self.b3, dW3, db3), (self.W4, self.b4, dW4, db4)]
            for W, b, gW, gb in params:
                gW += mu * (W - global_vec[idx:idx + W.size].reshape(W.shape))
                idx += W.size
                gb += mu * (b - global_vec[idx:idx + b.size])
                idx += b.size

        self.W4 -= lr * dW4; self.b4 -= lr * db4
        self.W3 -= lr * dW3; self.b3 -= lr * db3
        self.W2 -= lr * dW2; self.b2 -= lr * db2
        self.W1 -= lr * dW1; self.b1 -= lr * db1

    def to_vector(self):
        return np.concatenate([self.W1.ravel(), self.b1, self.W2.ravel(), self.b2,
                               self.W3.ravel(), self.b3, self.W4.ravel(), self.b4])

    @classmethod
    def from_vector(cls, vec, n_features, n_classes, rng, hidden1=128, hidden2=64):
        m = cls(n_features, n_classes, rng, hidden1, hidden2)
        idx = 0
        for W, b in [(m.W1, m.b1), (m.W2, m.b2), (m.W3, m.b3), (m.W4, m.b4)]:
            s = W.size; W[...] = vec[idx:idx + s].reshape(W.shape); idx += s
            s = b.size; b[...] = vec[idx:idx + s]; idx += s
        return m

    def predict(self, X):
        return self.forward(X).argmax(axis=1)

    def predict_proba(self, X):
        return self.forward(X)



def load_dataset(name):
    X = np.load(DATA_DIR / f"{name}_X.npy").astype(np.float64)
    y = np.load(DATA_DIR / f"{name}_y.npy")
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    for col in range(X.shape[1]):
        vals = X[:, col]
        p01, p99 = np.percentile(vals, [1, 99])
        X[:, col] = np.clip(vals, p01, p99)
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std < 1e-8] = 1.0
    X = (X - mean) / std
    # Label-encode y to 0..n_classes-1
    unique_y = np.unique(y)
    y_map = {v: i for i, v in enumerate(unique_y)}
    y = np.array([y_map[v] for v in y], dtype=np.int64)
    return X, y

def load_partition(name, alpha=0.5, n_clients=20):
    path = PART_DIR / f"{name}_alpha{alpha}_clients{n_clients}.json"
    with open(path) as f:
        p = json.load(f)
    return p["partitions"], p["clientSizes"]

def rdp_to_dp(epsilon_rdp, alpha, delta):
    return epsilon_rdp + math.log(1.0 / delta) / (alpha - 1)

def cosine_sim(a, b):
    dot = np.dot(a, b)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(dot / (na * nb))

def compute_adapt_noise(sigma_max, trust, resource, alpha_exp, beta_exp):
    return sigma_max * max(0, 1.0 - trust) ** alpha_exp * max(0, 1.0 - resource) ** beta_exp

def compute_effective_noise(sigma_base, sigma_adapt):
    return math.sqrt(sigma_base**2 + sigma_adapt**2)

def client_rdp_epsilon(sigma_eff, clip_norm, alpha_rdp):
    return alpha_rdp * clip_norm**2 / (2.0 * sigma_eff**2)

def fedavg(updates, sizes):
    total = sum(sizes)
    agg = np.zeros_like(updates[0])
    for u, s in zip(updates, sizes):
        agg += u * (s / total)
    return agg

def krum(updates, f_frac=0.3):
    n = len(updates)
    if n <= 2:
        return np.mean(updates, axis=0)
    f = max(1, int(n * f_frac))
    dists = np.zeros((n, n))
    for i in range(n):
        for j in range(i+1, n):
            d = np.linalg.norm(updates[i] - updates[j])
            dists[i, j] = d
            dists[j, i] = d
    scores = []
    for i in range(n):
        sorted_d = np.sort(dists[i])
        scores.append(np.sum(sorted_d[1:n-f]))
    return updates[int(np.argmin(scores))].copy()

def trimmed_mean(updates, beta_frac=0.1):
    n = len(updates)
    if n <= 2:
        return np.mean(updates, axis=0)
    trim = max(1, int(n * beta_frac))
    stacked = np.stack(updates)
    sorted_arr = np.sort(stacked, axis=0)
    trimmed = sorted_arr[trim:n-trim]
    return trimmed.mean(axis=0)

def clip_update(update, clip_norm):
    norm = np.linalg.norm(update)
    if norm > clip_norm:
        update = update * (clip_norm / norm)
    return update

def apply_attack(update, attack, rng):
    if attack == "sign_flip":
        return -update
    elif attack == "label_flip":
        return update * rng.uniform(0.5, 1.5, size=update.shape)
    elif attack == "scaling":
        return update * 10.0
    return update

def accuracy(y_true, y_pred):
    return float(np.mean(y_true == y_pred))

def macro_metrics(y_true, y_pred, n_classes):
    acc = accuracy(y_true, y_pred)
    precs, recs, f1s = [], [], []
    for c in range(n_classes):
        tp = np.sum((y_pred == c) & (y_true == c))
        fp = np.sum((y_pred == c) & (y_true != c))
        fn = np.sum((y_pred != c) & (y_true == c))
        p = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f = 2*p*r / (p+r) if (p+r) > 0 else 0.0
        precs.append(p); recs.append(r); f1s.append(f)
    mp = np.mean(precs)
    mr = np.mean(recs)
    mf1 = np.mean(f1s)
    wf1_num = np.sum([(np.sum(y_true == c)) * f1s[c] for c in range(n_classes)])
    wf1_den = len(y_true)
    wf1 = wf1_num / wf1_den if wf1_den > 0 else 0.0
    return acc, mp, mr, mf1, wf1

def run_single(dataset_name, method, attack, seed, n_clients, rounds, alpha_dir, hidden1=128, hidden2=64, arch="mlp", trust_log=False):
    rng = np.random.default_rng(seed)
    X, y = load_dataset(dataset_name)
    n_features = X.shape[1]
    n_classes = int(y.max()) + 1
    ModelCls = NumpyCNN1D if arch == "cnn" else NumpyMLP
    partitions, client_sizes = load_partition(dataset_name, alpha_dir, n_clients)

    client_data = []
    test_data = []
    for i in range(n_clients):
        idx = np.array(partitions[i], dtype=np.int64)
        if len(idx) == 0:
            client_data.append(None)
            test_data.append(None)
            continue
        rng.shuffle(idx)
        split = int(0.8 * len(idx))
        client_data.append((X[idx[:split]], y[idx[:split]]))
        test_data.append((X[idx[split:]], y[idx[split:]]))

    valid_clients = [i for i, c in enumerate(client_data) if c is not None]
    if not valid_clients:
        raise ValueError(f"All partitions empty for {dataset_name} alpha={alpha_dir}")

    X_test = np.concatenate([test_data[i][0] for i in valid_clients])
    y_test = np.concatenate([test_data[i][1] for i in valid_clients])

    global_model = ModelCls(n_features, n_classes, rng, hidden1, hidden2)
    global_vec = global_model.to_vector()

    trust_scores = np.full(n_clients, 0.5)
    resource_scores = rng.uniform(0.4, 0.9, size=n_clients)

    client_epsilons = []
    prev_global_vec = global_model.to_vector() * 0.01

    metrics_log = []
    trust_records = []

    for t in range(rounds):
        if method in ("TA-ADP", "cosAFed"):
            selected = [i for i in range(n_clients)
                        if resource_scores[i] > TAU_R and trust_scores[i] > TAU_T]
            if len(selected) < 3:
                selected = list(rng.choice(n_clients, size=min(3, n_clients), replace=False))
        else:
            frac = min(0.3, 10.0 / n_clients)
            n_sel = max(3, int(n_clients * frac))
            selected = list(rng.choice(n_clients, size=min(n_sel, n_clients), replace=False))

        updates = []
        client_sizes_sel = []
        poisoned_sel = []
        prox_mu = 0.01 if method == "FedProx+DP" else 0.0
        for ci in selected:
            if client_data[ci] is None:
                continue
            local_model = ModelCls.from_vector(global_vec, n_features, n_classes, rng, hidden1, hidden2)
            X_c, y_c = client_data[ci]
            n_c = len(X_c)
            for ep in range(LOCAL_EPOCHS):
                perm = rng.permutation(n_c)
                for start in range(0, n_c, BATCH_SIZE):
                    bidx = perm[start:start+BATCH_SIZE]
                    if len(bidx) < 2 or len(np.unique(y_c[bidx])) < 2:
                        continue
                    local_model.train_step(X_c[bidx], y_c[bidx], CNN_LR if arch == "cnn" else LR, global_vec if prox_mu > 0 else None, prox_mu)
            delta = local_model.to_vector() - global_vec
            if attack != "none" and rng.random() < 0.3:
                delta = apply_attack(delta, attack, rng)
                poisoned_sel.append(ci)
            if method in ("FedAvg+DP", "FedProx+DP", "FLTrust+DP", "cosAFed", "TA-ADP"):
                delta = clip_update(delta, CLIP_NORM)
            updates.append(delta)
            client_sizes_sel.append(client_sizes[ci])

        if len(updates) == 0:
            metrics_log.append({"round": t, "accuracy": 0.0})
            continue

        if method == "FedAvg":
            agg_delta = fedavg(updates, client_sizes_sel)
        elif method in ("FedAvg+DP", "FedProx+DP"):
            agg_delta = fedavg(updates, client_sizes_sel)
            sigma_eff = compute_effective_noise(SIGMA_BASE, SIGMA_MAX * 0.3)
            for ci in selected:
                ep = rdp_to_dp(client_rdp_epsilon(sigma_eff, CLIP_NORM, RDP_ORDER), RDP_ORDER, DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(sigma_eff, 4), "epsilon": round(ep, 4)})
            noise = rng.normal(0, sigma_eff / math.sqrt(len(selected)), size=agg_delta.shape)
            agg_delta += noise
        elif method == "Krum":
            agg_delta = krum(updates)
        elif method == "Trimmed Mean":
            agg_delta = trimmed_mean(updates)
        elif method == "FLTrust+DP":
            server_delta = global_vec - prev_global_vec
            sims = np.array([cosine_sim(u, server_delta) for u in updates])
            sims_clipped = np.clip(sims, 0, None)
            total = sims_clipped.sum()
            weights = sims_clipped / total if total > 1e-12 else np.ones(len(updates)) / len(updates)
            agg_delta = np.zeros_like(global_vec)
            for j, u in enumerate(updates):
                agg_delta += weights[j] * u
            sigma_noise = compute_effective_noise(SIGMA_BASE, SIGMA_MAX * 0.3)
            for ci in selected:
                ep = rdp_to_dp(client_rdp_epsilon(sigma_noise, CLIP_NORM, RDP_ORDER), RDP_ORDER, DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(sigma_noise, 4), "epsilon": round(ep, 4)})
            agg_delta += rng.normal(0, sigma_noise / math.sqrt(len(selected)), size=agg_delta.shape)
        elif method == "cosAFed":
            agg_delta = fedavg(updates, client_sizes_sel)
            sigma_eff = compute_effective_noise(SIGMA_BASE, SIGMA_MAX * 0.3)
            for ci in selected:
                ep = rdp_to_dp(client_rdp_epsilon(sigma_eff, CLIP_NORM, RDP_ORDER), RDP_ORDER, DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(sigma_eff, 4), "epsilon": round(ep, 4)})
            noise = rng.normal(0, sigma_eff / math.sqrt(len(selected)), size=agg_delta.shape)
            agg_delta += noise
        elif method == "TA-ADP":
            server_delta = global_vec - prev_global_vec
            tw = np.zeros(len(updates))
            sigmas_adapt = np.zeros(len(updates))
            trust_records_round = []
            for j, (upd, ci) in enumerate(zip(updates, selected)):
                cos_raw = 0.0 if t == 0 else cosine_sim(upd, server_delta)
                s_j = (1.0 + cos_raw) / 2.0
                trust_scores[ci] = LAMBDA_TRUST * trust_scores[ci] + (1.0 - LAMBDA_TRUST) * s_j
                tw[j] = max(trust_scores[ci], 0.01)
                sa = compute_adapt_noise(SIGMA_MAX, trust_scores[ci], resource_scores[ci], ALPHA_DP, BETA_DP)
                sigmas_adapt[j] = sa
                se = compute_effective_noise(SIGMA_BASE, sa)
                ep = rdp_to_dp(client_rdp_epsilon(se, CLIP_NORM, RDP_ORDER), RDP_ORDER, DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(se, 4), "epsilon": round(ep, 4)})
                if trust_log:
                    trust_records_round.append({"client": int(ci), "cos": round(cos_raw, 6),
                                                "s": round(s_j, 6), "T": round(float(trust_scores[ci]), 6),
                                                "sa": round(float(sa), 6),
                                                "resource": round(float(resource_scores[ci]), 6),
                                                "poisoned": ci in poisoned_sel})
            tw_sum = tw.sum()
            agg_delta = np.zeros_like(global_vec)
            for j, upd in enumerate(updates):
                agg_delta += upd * (tw[j] / tw_sum)
            avg_sigma = np.mean(sigmas_adapt)
            sigma_noise = compute_effective_noise(SIGMA_BASE, avg_sigma) / math.sqrt(len(selected))
            agg_delta += rng.normal(0, sigma_noise, size=agg_delta.shape)
            if trust_log:
                trust_records.append({"round": t,
                                      "trust": [round(float(x), 6) for x in trust_scores],
                                      "selected": [int(c) for c in selected],
                                      "poisoned": [int(c) for c in poisoned_sel],
                                      "clients": trust_records_round})

        prev_global_vec = global_vec.copy()
        global_vec = global_vec + LR * agg_delta

        if t % 10 == 0 or t == rounds - 1:
            m = ModelCls.from_vector(global_vec, n_features, n_classes, rng, hidden1, hidden2)
            y_pred = m.predict(X_test)
            acc, mp, mr, mf1, wf1 = macro_metrics(y_test, y_pred, n_classes)
            metrics_log.append({"round": t, "accuracy": round(acc, 4), "precision": round(mp, 4),
                                "recall": round(mr, 4), "macro_f1": round(mf1, 4), "weighted_f1": round(wf1, 4)})

    final_model = ModelCls.from_vector(global_vec, n_features, n_classes, rng, hidden1, hidden2)
    y_pred = final_model.predict(X_test)
    acc, mp, mr, mf1, wf1 = macro_metrics(y_test, y_pred, n_classes)

    max_eps = max((e["epsilon"] for e in client_epsilons), default=0.0)

    return {
        "dataset": dataset_name, "method": method, "attack": attack, "seed": seed,
        "accuracy": round(acc, 4), "precision": round(mp, 4), "recall": round(mr, 4),
        "macro_f1": round(mf1, 4), "weighted_f1": round(wf1, 4),
        "epsilon": round(max_eps, 2),
        "metrics_log": metrics_log, "client_epsilons": client_epsilons,
        "trust_log": trust_records,
        "f6_round0_neutral": True,
        "alpha": alpha_dir,
        "arch": arch,
    }

def run_pooled(method, attack, seed, n_clients, rounds, arch="mlp"):
    rng = np.random.default_rng(seed)
    all_X, all_y = [], []
    all_partitions = []
    all_sizes = []
    offset = 0
    max_features = 0
    for dname in DATASETS:
        X, y = load_dataset(dname)
        max_features = max(max_features, X.shape[1])
        all_X.append(X)
        all_y.append(y)
        p, s = load_partition(dname, 0.5, n_clients)
        all_partitions.append([(np.array(idx) + offset) for idx in p])
        all_sizes.append(s)
        offset += len(X)

    padded_X = []
    offset_y = 0
    adjusted_y = []
    for X, y in zip(all_X, all_y):
        if X.shape[1] < max_features:
            pad = np.zeros((len(X), max_features - X.shape[1]), dtype=X.dtype)
            padded_X.append(np.concatenate([X, pad], axis=1))
        else:
            padded_X.append(X)
        adjusted_y.append(y + offset_y)
        offset_y += int(y.max()) + 1

    X_all = np.concatenate(padded_X)
    y_all = np.concatenate(adjusted_y)
    n_features = X_all.shape[1]
    n_classes = int(y_all.max()) + 1

    client_data = []
    test_data = []
    for i in range(n_clients):
        idx_parts = []
        sizes_parts = []
        for pi, p in enumerate(all_partitions):
            idx_parts.append(p[i])
            sizes_parts.append(all_sizes[pi][i])
        idx = np.concatenate(idx_parts)
        rng.shuffle(idx)
        split = int(0.8 * len(idx))
        client_data.append((X_all[idx[:split]], y_all[idx[:split]]))
        test_data.append((X_all[idx[split:]], y_all[idx[split:]]))

    X_test = np.concatenate([d[0] for d in test_data])
    y_test = np.concatenate([d[1] for d in test_data])

    client_sizes = [d[0].shape[0] for d in client_data]

    global_model = NumpyMLP(n_features, n_classes, rng)
    global_vec = global_model.to_vector()
    trust_scores = np.full(n_clients, 0.5)
    resource_scores = rng.uniform(0.4, 0.9, size=n_clients)
    client_epsilons = []
    prev_global_vec = global_model.to_vector() * 0.01

    metrics_log = []
    for t in range(rounds):
        if method in ("TA-ADP", "cosAFed"):
            selected = [i for i in range(n_clients) if resource_scores[i] > TAU_R and trust_scores[i] > TAU_T]
            if len(selected) < 3:
                selected = list(rng.choice(n_clients, size=min(3, n_clients), replace=False))
        else:
            selected = list(range(n_clients))

        updates = []
        prox_mu = 0.01 if method == "FedProx+DP" else 0.0
        for ci in selected:
            local_model = NumpyMLP.from_vector(global_vec, n_features, n_classes, rng)
            X_c, y_c = client_data[ci]
            n_c = len(X_c)
            for ep in range(LOCAL_EPOCHS):
                perm = rng.permutation(n_c)
                for start in range(0, n_c, BATCH_SIZE):
                    bidx = perm[start:start+BATCH_SIZE]
                    if len(bidx) < 2 or len(np.unique(y_c[bidx])) < 2:
                        continue
                    local_model.train_step(X_c[bidx], y_c[bidx], CNN_LR if arch == "cnn" else LR, global_vec if prox_mu > 0 else None, prox_mu)
            delta = local_model.to_vector() - global_vec
            if attack != "none" and rng.random() < 0.3:
                delta = apply_attack(delta, attack, rng)
            if method in ("FedAvg+DP", "FedProx+DP", "FLTrust+DP", "cosAFed", "TA-ADP"):
                delta = clip_update(delta, CLIP_NORM)
            updates.append(delta)

        if len(updates) == 0:
            metrics_log.append({"round": t, "accuracy": 0.0})
            continue

        if method == "FedAvg":
            agg_delta = fedavg(updates, [client_sizes[i] for i in selected])
        elif method in ("FedAvg+DP", "FedProx+DP"):
            agg_delta = fedavg(updates, [client_sizes[i] for i in selected])
            se = compute_effective_noise(SIGMA_BASE, SIGMA_MAX * 0.3)
            for ci in selected:
                ep = rdp_to_dp(client_rdp_epsilon(se, CLIP_NORM, RDP_ORDER), RDP_ORDER, DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(se, 4), "epsilon": round(ep, 4)})
            agg_delta += rng.normal(0, se / math.sqrt(len(selected)), size=agg_delta.shape)
        elif method == "Krum":
            agg_delta = krum(updates)
        elif method == "Trimmed Mean":
            agg_delta = trimmed_mean(updates)
        elif method == "FLTrust+DP":
            sd = global_vec - prev_global_vec
            sims = np.array([cosine_sim(u, sd) for u in updates])
            sc = np.clip(sims, 0, None)
            tot = sc.sum()
            w = sc / tot if tot > 1e-12 else np.ones(len(updates)) / len(updates)
            agg_delta = sum(w[j] * updates[j] for j in range(len(updates)))
            sn = compute_effective_noise(SIGMA_BASE, SIGMA_MAX * 0.3)
            for ci in selected:
                ep = rdp_to_dp(client_rdp_epsilon(sn, CLIP_NORM, RDP_ORDER), RDP_ORDER, DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(sn, 4), "epsilon": round(ep, 4)})
            agg_delta += rng.normal(0, sn / math.sqrt(len(selected)), size=agg_delta.shape)
        elif method == "cosAFed":
            agg_delta = fedavg(updates, [client_sizes[i] for i in selected])
            se = compute_effective_noise(SIGMA_BASE, SIGMA_MAX * 0.3)
            for ci in selected:
                ep = rdp_to_dp(client_rdp_epsilon(se, CLIP_NORM, RDP_ORDER), RDP_ORDER, DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(se, 4), "epsilon": round(ep, 4)})
            agg_delta += rng.normal(0, se / math.sqrt(len(selected)), size=agg_delta.shape)
        elif method == "TA-ADP":
            sd = global_vec - prev_global_vec
            tw = np.zeros(len(updates))
            sigmas = np.zeros(len(updates))
            for j, (upd, ci) in enumerate(zip(updates, selected)):
                cr = cosine_sim(upd, sd)
                sj = (1.0 + cr) / 2.0
                trust_scores[ci] = LAMBDA_TRUST * trust_scores[ci] + (1.0 - LAMBDA_TRUST) * sj
                tw[j] = max(trust_scores[ci], 0.01)
                sa = compute_adapt_noise(SIGMA_MAX, trust_scores[ci], resource_scores[ci], ALPHA_DP, BETA_DP)
                sigmas[j] = sa
                se = compute_effective_noise(SIGMA_BASE, sa)
                ep = rdp_to_dp(client_rdp_epsilon(se, CLIP_NORM, RDP_ORDER), RDP_ORDER, DELTA)
                client_epsilons.append({"client": ci, "round": t, "sigma_eff": round(se, 4), "epsilon": round(ep, 4)})
            tw_s = tw.sum()
            agg_delta = sum(updates[j] * (tw[j] / tw_s) for j in range(len(updates)))
            avg_s = np.mean(sigmas)
            sn = compute_effective_noise(SIGMA_BASE, avg_s) / math.sqrt(len(selected))
            agg_delta += rng.normal(0, sn, size=agg_delta.shape)

        prev_global_vec = global_vec.copy()
        global_vec = global_vec + LR * agg_delta

        if t % 10 == 0 or t == rounds - 1:
            m = NumpyMLP.from_vector(global_vec, n_features, n_classes, rng)
            yp = m.predict(X_test)
            a, p, r, mf, wf = macro_metrics(y_test, yp, n_classes)
            metrics_log.append({"round": t, "accuracy": round(a, 4)})

    fm = NumpyMLP.from_vector(global_vec, n_features, n_classes, rng)
    yp = fm.predict(X_test)
    a, p, r, mf, wf = macro_metrics(y_test, yp, n_classes)
    me = max((e["epsilon"] for e in client_epsilons), default=0.0)
    return {
        "dataset": "pooled", "method": method, "attack": attack, "seed": seed,
        "accuracy": round(a, 4), "precision": round(p, 4), "recall": round(r, 4),
        "macro_f1": round(mf, 4), "weighted_f1": round(wf, 4), "epsilon": round(me, 2),
        "metrics_log": metrics_log, "client_epsilons": client_epsilons,
    }

class NumpyEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, np.integer):
            return int(o)
        if isinstance(o, np.floating):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, np.bool_):
            return bool(o)
        return super().default(o)

def main():
    global SIGMA_BASE
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", type=int, default=100)
    parser.add_argument("--seeds", type=int, default=5)
    parser.add_argument("--clients", type=int, default=20)
    parser.add_argument("--dataset", type=str, default=None)
    parser.add_argument("--method", type=str, default=None)
    parser.add_argument("--attack", type=str, default="none")
    parser.add_argument("--output", type=str, default=None)
    parser.add_argument("--no-pooled", action="store_true")
    parser.add_argument("--alpha", type=float, default=0.5)
    parser.add_argument("--arch", type=str, default="mlp", choices=["mlp", "cnn"])
    parser.add_argument("--sigma-base", type=float, default=None,
                        help="override SIGMA_BASE (noise sweep)")
    parser.add_argument("--trust-log", action="store_true",
                        help="log per-round trust vectors, cosine scores, poisoned clients (TA-ADP)")
    args = parser.parse_args()
    if args.sigma_base is not None:
        SIGMA_BASE = args.sigma_base

    seeds = [42 + i * 7 for i in range(args.seeds)]
    datasets = [args.dataset] if args.dataset else (DATASETS if args.no_pooled else DATASETS + ["pooled"])
    methods = [args.method] if args.method else METHODS
    attacks = [args.attack]

    all_results = []
    total = len(datasets) * len(methods) * len(attacks) * args.seeds
    done = 0

    out_path = OUT_DIR / (args.output if args.output else "verified_results_v2.json")
    if out_path.exists():
        try:
            with open(out_path) as f:
                all_results = json.load(f)
        except Exception:
            all_results = []

    def already_done(dname, method, atk, seed):
        return any(r["dataset"] == dname and r["method"] == method
                   and r.get("attack", "none") == atk and r["seed"] == seed
                   and r.get("alpha", 0.5) == args.alpha
                   and r.get("arch", "mlp") == args.arch for r in all_results)

    for dname in datasets:
        for method in methods:
            for atk in attacks:
                for seed in seeds:
                    if already_done(dname, method, atk, seed):
                        continue
                    done += 1
                    t0 = time.time()
                    print(f"[{done}/{total}] {dname} | {method} | {atk} | seed={seed} ...", end=" ", flush=True)
                    try:
                        if dname == "pooled":
                            res = run_pooled(method, atk, seed, args.clients, args.rounds)
                        else:
                            res = run_single(dname, method, atk, seed, args.clients, args.rounds, args.alpha, arch=args.arch, trust_log=args.trust_log)
                        if args.sigma_base is not None:
                            res["sigma_base"] = args.sigma_base
                        elapsed = time.time() - t0
                        print(f"acc={res['accuracy']:.4f} eps={res['epsilon']:.2f} ({elapsed:.1f}s)")
                        all_results.append(res)
                        with open(out_path, "w") as f:
                            json.dump(all_results, f, indent=2, cls=NumpyEncoder)
                    except Exception as e:
                        elapsed = time.time() - t0
                        print(f"ERROR: {e} ({elapsed:.1f}s)")

    out_path = OUT_DIR / (args.output if args.output else "verified_results_v2.json")
    with open(out_path, "w") as f:
        json.dump(all_results, f, indent=2, cls=NumpyEncoder)
    print(f"\nResults saved to {out_path}")

if __name__ == "__main__":
    main()

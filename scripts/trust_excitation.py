"""Trust-excitation analysis (pre-registered hypotheses H1-H3).

Input : data/results/results_trust_excitation.json  (TA-ADP, TON-IoT, 3 seeds
        x {benign, sign_flip}, 100 rounds, --trust-log, round-0 trust neutral)
Output: data/review/trust_excitation_output.txt (+ stdout)
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "results" / "results_trust_excitation.json"
DST = ROOT / "data" / "review" / "trust_excitation_output.txt"
TAU_T = 0.4

runs = json.load(open(SRC))
out = []
def p(s=""):
    out.append(s)

def ms(a):
    a = np.asarray(a, dtype=float)
    return f"{a.mean():.4f} +/- {a.std():.4f}" if len(a) else "n/a"

def run_row(r):
    tl = r["trust_log"]
    allT = np.array([v for rec in tl for v in rec["trust"]])
    det = [c for rec in tl for c in rec["clients"]]
    pois = [c for c in det if c["poisoned"]]
    clean = [c for c in det if not c["poisoned"]]
    excl = [(rec["round"], i) for rec in tl for i, v in enumerate(rec["trust"]) if v <= TAU_T]
    first = min((rr for rr, _ in excl), default=-1)
    term = tl[-1]["trust"]
    ever_p = {c["client"] for c in pois}
    tp = [term[i] for i in ever_p]
    tn = [term[i] for i in range(len(term)) if i not in ever_p]
    return {
        "attack": r["attack"], "seed": r["seed"], "acc": r["accuracy"], "eps": r["epsilon"],
        "tmin": allT.min(), "tmax": allT.max(),
        "pois_n": len(pois), "clean_n": len(clean),
        "pois_share": len(pois) / max(1, len(det)),
        "cos_p": ms([c["cos"] for c in pois]), "cos_c": ms([c["cos"] for c in clean]),
        "cos_p_mean": np.mean([c["cos"] for c in pois]) if pois else 0.0,
        "cos_c_mean": np.mean([c["cos"] for c in clean]) if clean else 0.0,
        "T_p": ms([c["T"] for c in pois]), "T_c": ms([c["T"] for c in clean]),
        "T_p_min": min((c["T"] for c in pois), default=0.5),
        "sa_p": ms([c["sa"] for c in pois]) if pois else "n/a",
        "n_excl": len(excl), "first_excl": first,
        "ever_p": len(ever_p), "term_p": ms(tp), "term_n": ms(tn),
        "all_excl_clients": len({i for _, i in excl}),
    }

rows = [run_row(r) for r in sorted(runs, key=lambda x: (x["attack"], x["seed"]))]
ben = [r for r in rows if r["attack"] == "none"]
atk = [r for r in rows if r["attack"] == "sign_flip"]

p("=" * 112)
p("TRUST EXCITATION — TON-IoT | TA-ADP | 100 rounds | 3 seeds x {benign, sign_flip}")
p(f"source: {SRC.relative_to(ROOT)}   tau_T={TAU_T}   round-0 neutral = True")
p("=" * 112)
p()
p("PER-RUN TABLE")
p(f"{'attack':<10} {'seed':>4} {'acc':>7} {'eps':>5} {'T range':>18} "
  f"{'pois%':>6} {'cos pois':>14} {'cos clean':>14} {'T pois':>14} {'T clean':>14} {'excl':>6} {'1stExcl':>8}")
for r in rows:
    p(f"{r['attack']:<10} {r['seed']:>4} {r['acc']*100:>6.2f} {r['eps']:>5.2f} "
      f"[{r['tmin']:.4f},{r['tmax']:.4f}] {'':>0}{r['pois_share']*100:>5.1f}% "
      f"{r['cos_p']:>14} {r['cos_c']:>14} {r['T_p']:>14} {r['T_c']:>14} "
      f"{r['n_excl']:>6} {r['first_excl']:>8}")
p()

# ---- pooled verdicts -------------------------------------------------------
def pool(rs, key, field):
    vals = []
    for r in rs:
        pass
    return vals

benT = np.array([v for r in runs if r["attack"] == "none" for rec in r["trust_log"] for v in rec["trust"]])
atkT = np.array([v for r in runs if r["attack"] == "sign_flip" for rec in r["trust_log"] for v in rec["trust"]])
p("H1 — BENIGN CONTROL (replicates F1)")
p(f"  benign trust range: [{benT.min():.4f}, {benT.max():.4f}]  max|T-0.5| = {np.abs(benT-0.5).max():.4f}")
f1_lo, f1_hi = 0.4902, 0.5044
p(f"  F1 corpus range    : [{f1_lo}, {f1_hi}]")
p(f"  verdict: {'PASS (within/near F1 envelope)' if benT.min() >= f1_lo - 0.002 and benT.max() <= f1_hi + 0.002 else 'OUTSIDE F1 envelope — investigate'}")
p()

# H2: poisoned records under attack
pois = [c for r in runs if r["attack"] == "sign_flip" for rec in r["trust_log"] for c in rec["clients"] if c["poisoned"]]
clean_atk = [c for r in runs if r["attack"] == "sign_flip" for rec in r["trust_log"] for c in rec["clients"] if not c["poisoned"]]
cos_p = np.array([c["cos"] for c in pois]); cos_c = np.array([c["cos"] for c in clean_atk])
T_p = np.array([c["T"] for c in pois]); T_c = np.array([c["T"] for c in clean_atk])
n_excl_atk = sum(r["n_excl"] for r in atk)
n_excl_ben = sum(r["n_excl"] for r in ben)
firsts = [r["first_excl"] for r in atk if r["first_excl"] >= 0]
p("H2 — ATTACKER EXCITATION (sign_flip)")
p(f"  poisoned client-rounds: {len(pois)} ({len(pois)/ (len(pois)+len(clean_atk))*100:.1f}% of selected)")
p(f"  cos  poisoned : {ms(cos_p)}   min={cos_p.min():.4f}   frac<0 = {np.mean(cos_p<0)*100:.1f}%")
p(f"  cos  clean    : {ms(cos_c)}   min={cos_c.min():.4f}   frac<0 = {np.mean(cos_c<0)*100:.1f}%")
p(f"  T    poisoned : {ms(T_p)}   min={T_p.min():.4f}")
p(f"  T    clean    : {ms(T_c)}   min={T_c.min():.4f}")
p(f"  poisoned client-rounds with T <= tau_T: {int(np.sum(T_p <= TAU_T))} / {len(T_p)}")
p(f"  exclusions (T<=tau_T): attack runs {n_excl_atk} client-rounds ({sum(r['all_excl_clients'] for r in atk)} distinct clients) | benign {n_excl_ben}")
p(f"  time-to-first exclusion per attack seed: {firsts if firsts else 'none'}")
# paired within-round contrast: poisoned cos vs clean cos in same rounds
diff = cos_p.mean() - cos_c.mean()
p(f"  mean(cos_pois - cos_clean) = {diff:+.6f}")
h2_pass = bool(np.sum(T_p <= TAU_T) > 0) or (diff < -0.01)
p(f"  verdict: {'PASS' if h2_pass else 'FAIL — sign-flip does not excite the similarity channel'}")
p()

# H3 — accuracy
acc_b = [r["acc"] for r in ben]; acc_a = [r["acc"] for r in atk]
p("H3 — CONSEQUENCE (accuracy)")
p(f"  benign : {ms(acc_b)}  (x100: {ms([a*100 for a in acc_b])})")
p(f"  attack : {ms(acc_a)}  (x100: {ms([a*100 for a in acc_a])})")
p(f"  delta (attack - benign) = {(np.mean(acc_a)-np.mean(acc_b))*100:+.2f} pp")
p(f"  exclusions occurred: {'yes' if n_excl_atk else 'no'} -> trust selection active: {'yes' if n_excl_atk else 'no'}")
p()

p("TERMINAL TRUST (round 99) — ever-poisoned vs never-poisoned clients (attack runs)")
for r in atk:
    p(f"  seed {r['seed']}: ever-poisoned {r['ever_p']} clients T={r['term_p']} | never T={r['term_n']}")
p()
p("PRE-REGISTERED INTERPRETATION (hypotheses H1-H3)")
if not h2_pass:
    p("  H2 FAILS: the cosine channel is starved AND symmetric under negation —")
    p("  sign-flipping an update with cos ~= 0 still yields cos ~= 0, so poisoning")
    p("  is invisible to this trust statistic at the tested operating point.")
    p("  -> trust-aware branding should be retired for sign-flip detection, or the")
    p("     similarity input must be redesigned (multi-reference/residual trust).")
else:
    p("  H2 PASSES: see numbers above; check H3 for end-to-end justification.")
p("=" * 112)

text = "\n".join(out)
DST.parent.mkdir(parents=True, exist_ok=True)
DST.write_text(text, encoding="utf-8")
print(text)
print(f"\nwritten -> {DST}")

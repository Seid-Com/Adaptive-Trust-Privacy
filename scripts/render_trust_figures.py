"""Render trust-analysis figures as dependency-free SVG.

Outputs -> figures/fig1_trust_trajectories.svg
           figures/fig2_trust_histogram.svg
           figures/fig3_excitation.svg
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "data" / "results"
OUT = ROOT / "figures"
OUT.mkdir(exist_ok=True)
TAU_T = 0.4

W, H = 760, 420
ML, MR, MT, MB = 70, 20, 34, 54  # margins


def svg_head(title):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}" font-family="Helvetica,Arial,sans-serif">',
            f'<rect width="{W}" height="{H}" fill="white"/>',
            f'<text x="{W/2}" y="20" text-anchor="middle" font-size="15" font-weight="bold">{title}</text>']


def axes(xlabel, ylabel, xr, yr, yticks, xticks):
    x0, x1 = ML, W - MR
    y0, y1 = H - MB, MT + 8
    sx = lambda v: x0 + (v - xr[0]) / (xr[1] - xr[0]) * (x1 - x0)
    sy = lambda v: y0 + (v - yr[0]) / (yr[1] - yr[0]) * (y1 - y0)
    els = [f'<rect x="{x0}" y="{y1}" width="{x1-x0}" height="{y0-y1}" fill="none" stroke="#333"/>']
    for yt in yticks:
        y = sy(yt)
        els.append(f'<line x1="{x0-4}" y1="{y:.1f}" x2="{x0}" y2="{y:.1f}" stroke="#333"/>')
        els.append(f'<text x="{x0-7}" y="{y+4:.1f}" text-anchor="end" font-size="12">{yt:g}</text>')
    for xt in xticks:
        x = sx(xt)
        els.append(f'<line x1="{x:.1f}" y1="{y0}" x2="{x:.1f}" y2="{y0+4}" stroke="#333"/>')
        els.append(f'<text x="{x:.1f}" y="{y0+17}" text-anchor="middle" font-size="12">{xt:g}</text>')
    els.append(f'<text x="{(x0+x1)/2:.0f}" y="{H-14}" text-anchor="middle" font-size="13">{xlabel}</text>')
    els.append(f'<text x="18" y="{(y0+y1)/2:.0f}" text-anchor="middle" font-size="13" '
               f'transform="rotate(-90 18 {(y0+y1)/2:.0f})">{ylabel}</text>')
    return sx, sy, els


def polyline(pts, sx, sy, **kw):
    d = " ".join(f"{sx(a):.1f},{sy(b):.1f}" for a, b in pts)
    k = " ".join(f'{kk.replace("_","-")}="{vv}"' for kk, vv in kw.items())
    return f'<polyline points="{d}" fill="none" {k}/>'


def save(name, els):
    p = OUT / name
    p.write_text("\n".join(els + ["</svg>"]), encoding="utf-8")
    print(f"  -> {p} ({p.stat().st_size//1024} KB)")


# --------------------------------------------------------------- Fig 1
def fig1():
    runs = json.load(open(RES / "results_ablation.json"))
    n_r = 100
    pool = [[] for _ in range(n_r)]          # all values per round
    run_mean = []                            # per-run mean trajectory
    for r in runs:
        tl = r.get("trust_log") or []
        traj = []
        for rec in tl:
            t = rec["round"]
            if t < n_r:
                pool[t].extend(rec["trust"])
                traj.append(float(np.mean(rec["trust"])))
        if traj:
            run_mean.append(traj)
    lo = [min(p) for p in pool]
    hi = [max(p) for p in pool]
    gm = [float(np.mean(p)) for p in pool]

    els = svg_head("Fig. 1. All trust trajectories are flat: ablation envelope + 40 run means")
    sx, sy, ax = axes("Communication round", "Trust score T", (-1, 100), (0.38, 0.525),
                      [0.4, 0.45, 0.5], [0, 20, 40, 60, 80, 100])
    els += ax
    band = [(x, hi[x]) for x in range(n_r)] + [(x, lo[x]) for x in range(n_r - 1, -1, -1)]
    d = " ".join(f"{sx(a):.1f},{sy(b):.1f}" for a, b in band)
    els.append(f'<polygon points="{d}" fill="#9ecae1" fill-opacity="0.55" stroke="none"/>')
    for traj in run_mean:
        els.append(polyline([(i, v) for i, v in enumerate(traj)], sx, sy,
                            stroke="#3182bd", stroke_width="0.6", stroke_opacity="0.55"))
    els.append(polyline([(i, v) for i, v in enumerate(gm)], sx, sy, stroke="#08306b", stroke_width="2.4"))
    els.append(f'<line x1="{sx(0):.1f}" y1="{sy(0.5):.1f}" x2="{sx(100):.1f}" y2="{sy(0.5):.1f}" '
               f'stroke="#555" stroke-width="1" stroke-dasharray="2,4"/>')
    els.append(f'<line x1="{sx(0):.1f}" y1="{sy(0.4):.1f}" x2="{sx(100):.1f}" y2="{sy(0.4):.1f}" '
               f'stroke="#d62728" stroke-width="1.6" stroke-dasharray="8,5"/>')
    els.append(f'<text x="{sx(58):.0f}" y="{sy(0.4)+16:.0f}" font-size="12" fill="#d62728">selection threshold tau_T = 0.4 (never reached)</text>')
    els.append(f'<text x="{sx(4):.0f}" y="{sy(0.5)-8:.0f}" font-size="12" fill="#555">T = 0.5 (initialization)</text>')
    els.append(f'<text x="{sx(52):.0f}" y="{sy(0.4975):.0f}" font-size="12" fill="#08306b">ablation envelope: [{min(lo):.4f}, {max(hi):.4f}]</text>')
    save("fig1_trust_trajectories.svg", els)


# --------------------------------------------------------------- Fig 2
def fig2():
    files = ["results_ablation.json", "results_eps_sweep.json", "results_scalability.json"]
    vals = []
    for f in files:
        runs = json.load(open(RES / f))
        n = 0
        for r in runs:
            for rec in (r.get("trust_log") or []):
                vals.extend(rec["trust"]); n += len(rec["trust"])
        print(f"  {f}: {n} values")
        del runs
    vals = np.array(vals)
    print(f"  pooled: {len(vals)} values, range [{vals.min():.4f}, {vals.max():.4f}]")

    bins = np.linspace(0.48, 0.52, 41)
    hist, _ = np.histogram(vals, bins=bins)
    hist = hist / hist.max()

    els = svg_head(f"Fig. 2. Pooled trust distribution: {len(vals):,} values, all within +/-{np.abs(vals-0.5).max():.4f} of 0.5")
    sx, sy, ax = axes("Trust score T (bins of 0.001)", "Fraction of values", (0.48, 0.52), (0, 1.12),
                      [0, 0.5, 1], [0.48, 0.49, 0.5, 0.51, 0.52])
    els += ax
    bw = sx(bins[1]) - sx(bins[0])
    for i, h in enumerate(hist):
        if h > 0:
            x = sx(bins[i])
            els.append(f'<rect x="{x:.2f}" y="{sy(h):.2f}" width="{bw-0.6:.2f}" '
                       f'height="{sy(0)-sy(h):.2f}" fill="#3182bd" fill-opacity="0.85"/>')
    els.append(f'<line x1="{sx(0.5):.1f}" y1="{sy(0):.1f}" x2="{sx(0.5):.1f}" y2="{sy(1.1):.1f}" '
               f'stroke="#08306b" stroke-width="1.2" stroke-dasharray="4,3"/>')
    els.append(f'<text x="{sx(0.5012):.1f}" y="{sy(1.06):.1f}" font-size="12" fill="#08306b">T = 0.5</text>')
    els.append(f'<text x="{sx(0.4815):.1f}" y="{sy(1.06):.1f}" font-size="12" fill="#d62728">tau_T = 0.4 &lt;- (0 / {len(vals):,} values reach it; off-scale)</text>')
    save("fig2_trust_histogram.svg", els)
    return len(vals)


# --------------------------------------------------------------- Fig 3
def fig3():
    runs = json.load(open(RES / "results_trust_excitation.json"))
    n_r = 100
    ben = [[] for _ in range(n_r)]
    cln = [[] for _ in range(n_r)]
    pois = [[] for _ in range(n_r)]
    for r in runs:
        for rec in (r.get("trust_log") or []):
            t = rec["round"]
            if r["attack"] == "none":
                ben[t].extend(rec["trust"])
            else:
                for c in rec["clients"]:
                    (pois if c["poisoned"] else cln)[t].append(c["T"])
    mb = [float(np.mean(ben[t])) if ben[t] else np.nan for t in range(n_r)]
    mc = [float(np.mean(cln[t])) if cln[t] else np.nan for t in range(n_r)]
    mp = [float(np.mean(pois[t])) if pois[t] else np.nan for t in range(n_r)]
    rng_p = [(t, min(pois[t])) for t in range(n_r) if pois[t]]
    rng_p2 = [(t, max(pois[t])) for t in range(n_r) if pois[t]]

    n_poisoned = sum(len(p) for p in pois)
    els = svg_head("Fig. 3. Excitation test: sign-flip does not move trust (poisoned vs clean, 3 seeds pooled)")
    sx, sy, ax = axes("Communication round", "Trust score T", (-1, 100), (0.38, 0.53),
                      [0.4, 0.45, 0.5], [0, 20, 40, 60, 80, 100])
    els += ax
    band = rng_p2 + rng_p[::-1]
    d = " ".join(f"{sx(a):.1f},{sy(b):.1f}" for a, b in band)
    els.append(f'<polygon points="{d}" fill="#fdae6b" fill-opacity="0.5" stroke="none"/>')
    els.append(polyline([(i, v) for i, v in enumerate(mb) if not np.isnan(v)], sx, sy,
                        stroke="#3182bd", stroke_width="2.0"))
    els.append(polyline([(i, v) for i, v in enumerate(mc) if not np.isnan(v)], sx, sy,
                        stroke="#666", stroke_width="1.4", stroke_dasharray="6,4"))
    els.append(polyline([(i, v) for i, v in enumerate(mp) if not np.isnan(v)], sx, sy,
                        stroke="#d94801", stroke_width="2.0"))
    els.append(f'<line x1="{sx(0):.1f}" y1="{sy(0.4):.1f}" x2="{sx(100):.1f}" y2="{sy(0.4):.1f}" '
               f'stroke="#d62728" stroke-width="1.6" stroke-dasharray="8,5"/>')
    els.append(f'<text x="{sx(58):.0f}" y="{sy(0.4)+16:.0f}" font-size="12" fill="#d62728">tau_T = 0.4: 0 / {n_poisoned:,} poisoned client-rounds cross it</text>')
    lx, ly = sx(3), sy(0.522)
    for i, (col, lab) in enumerate([("#3182bd", "benign arm (mean T)"),
                                    ("#d94801", "poisoned client-rounds (mean T)"),
                                    ("#666", "clean client-rounds under attack (mean T)")]):
        els.append(f'<line x1="{lx}" y1="{ly+10*i:.0f}" x2="{lx+26}" y2="{ly+10*i:.0f}" stroke="{col}" stroke-width="2.4"/>')
        els.append(f'<text x="{lx+32}" y="{ly+4+10*i:.0f}" font-size="11.5">{lab}</text>')
    save("fig3_excitation.svg", els)


if __name__ == "__main__":
    print("Fig 1:")
    fig1()
    print("Fig 2:")
    n2 = fig2()
    print("Fig 3:")
    fig3()
    print(f"done. pooled corpus values = {n2}")

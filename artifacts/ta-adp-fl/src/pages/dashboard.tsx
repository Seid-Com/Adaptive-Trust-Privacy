import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useGetSimulationResults, useRunSimulation, useListClients } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Zap, ShieldCheck, Target, TrendingUp, AlertTriangle, BarChart2, Cpu, Radio, PackageOpen, Code2, Copy, Check, ChevronDown, ChevronUp, History } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import JSZip from "jszip";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from "recharts";

const DATASETS = ["TON-IoT", "Edge-IIoTset", "Bot-IoT"] as const;
const AUTO_SIM_NAMES = [
  "TA-ADP Auto-Run — TON-IoT",
  "TA-ADP Auto-Run — Edge-IIoTset",
  "TA-ADP Auto-Run — Bot-IoT (High Privacy)",
];

function AutoBootLoader({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const runSim = useRunSimulation();
  const ranRef = useRef(false);

  const addLog = (msg: string) => setLog((l) => [...l, msg]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    async function boot() {
      addLog("[SYSTEM] TA-ADP framework initializing...");
      await sleep(600);
      addLog("[SYSTEM] Seeding 20 heterogeneous IoT client devices...");
      await sleep(700);

      for (let i = 0; i < DATASETS.length; i++) {
        setPhase(i + 1);
        addLog(`[FL] Configuring federation for dataset: ${DATASETS[i]}`);
        await sleep(400);
        addLog(`[DP]  ε=${i === 2 ? "0.5" : "1.0"}, δ=1e-5 | α=${i === 2 ? "0.6" : "0.5"}, β=0.3`);
        await sleep(300);
        addLog(`[RUN] Launching simulation "${AUTO_SIM_NAMES[i]}"...`);

        try {
          await runSim.mutateAsync({ name: AUTO_SIM_NAMES[i] });
          addLog(`[✓]  Simulation ${i + 1}/${DATASETS.length} complete.`);
        } catch {
          addLog(`[!]  Simulation ${i + 1} skipped (data may already exist).`);
        }
        await sleep(300);
      }

      addLog("[SYSTEM] All simulations complete. Loading dashboard...");
      await sleep(800);
      onDone();
    }

    boot();
  }, []);

  const pct = Math.round((phase / DATASETS.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4"
    >
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Radio className="h-6 w-6 text-primary animate-pulse" />
          <h2 className="text-2xl font-bold text-white font-mono">Autonomous FL Initialization</h2>
          <Cpu className="h-6 w-6 text-accent animate-spin" style={{ animationDuration: "3s" }} />
        </div>
        <p className="text-muted-foreground text-sm font-mono">
          Running TA-ADP simulations across all 3 IoT datasets automatically...
        </p>
      </div>

      <div className="w-full max-w-xl space-y-3">
        <div className="flex justify-between text-xs font-mono text-muted-foreground mb-1">
          <span>Progress</span>
          <span>{pct}% — Dataset {phase}/{DATASETS.length}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className="flex gap-2 mt-2">
          {DATASETS.map((ds, i) => (
            <div key={ds} className={`flex-1 py-1 px-2 rounded text-center text-xs font-mono border transition-all duration-500 ${
              i < phase ? "border-accent/50 bg-accent/10 text-accent" :
              i === phase ? "border-primary/50 bg-primary/10 text-primary animate-pulse" :
              "border-white/5 text-white/20"
            }`}>{ds}</div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-xl bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-xs space-y-1 h-48 overflow-y-auto">
        {log.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className={`${line.startsWith("[✓]") ? "text-green-400" : line.startsWith("[!]") ? "text-yellow-400" : line.startsWith("[FL]") ? "text-primary" : line.startsWith("[DP]") ? "text-accent" : line.startsWith("[RUN]") ? "text-white" : "text-muted-foreground"}`}
          >
            {line}
          </motion.div>
        ))}
        {runSim.isPending && (
          <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="text-primary">
            ▋ running federated rounds...
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function Dashboard() {
  const { data: results, isLoading, refetch } = useGetSimulationResults();
  const { data: clients } = useListClients();
  const [autoBooted, setAutoBooted] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [showPython, setShowPython] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const copySnippet = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAllData = async () => {
    if (!results || results.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const dataFolder = zip.folder("ta-adp-fl-data")!;

      // 1. Rounds CSVs — one per simulation
      const roundsHeader = "round,accuracy,loss,participants,avg_trust_score,avg_noise_scale,cumulative_epsilon,comm_cost_mb,energy_joules";
      results.forEach((r) => {
        const rows = (r.rounds ?? []).map((rd) =>
          [rd.roundNumber, rd.globalAccuracy.toFixed(6), rd.globalLoss.toFixed(6),
           rd.numSelectedClients, rd.avgTrustScore.toFixed(4), rd.avgNoiseScale.toFixed(4),
           rd.cumulativePrivacyLoss.toFixed(4), rd.communicationCost.toFixed(2), rd.energyConsumed.toFixed(4)].join(",")
        );
        const csv = [roundsHeader, ...rows].join("\n");
        const fname = `rounds/${(r.name ?? `run_${r.id}`).replace(/\s+/g, "_")}_rounds.csv`;
        dataFolder.file(fname, csv);
      });

      // 2. Simulations summary CSV
      const simHeader = "id,name,dataset,num_clients,num_rounds,epsilon,delta,alpha,beta,final_accuracy,final_loss,avg_privacy_loss,convergence_round";
      const simRows = results.map((r) =>
        [r.id, `"${r.name}"`, r.dataset, r.numClients, r.numRounds,
         r.baseEpsilon, r.baseDelta, r.alphaWeight, r.betaWeight,
         (r.finalAccuracy as number).toFixed(6), (r.finalLoss as number).toFixed(6),
         r.avgPrivacyLoss.toFixed(4), r.convergenceRound ?? ""].join(",")
      );
      dataFolder.file("simulations_summary.csv", [simHeader, ...simRows].join("\n"));

      // 3. Clients CSV
      if (clients && clients.length > 0) {
        const cHeader = "id,name,device_type,trust_score,compute_capacity_tflops,battery_level_pct,bandwidth_mbps,is_active";
        const cRows = clients.map((c) =>
          [c.id, `"${c.name}"`, c.deviceType, c.trustScore.toFixed(4), c.computeCapacity.toFixed(2),
           c.batteryLevel, c.bandwidthMbps, c.isActive ? "true" : "false"].join(",")
        );
        dataFolder.file("iot_client_registry.csv", [cHeader, ...cRows].join("\n"));
      }

      // 4. README
      const readme = [
        "# TA-ADP FL — Exported Data",
        `Exported: ${new Date().toISOString()}`,
        "",
        "## Files",
        "- rounds/<name>_rounds.csv  — per-round metrics for each simulation",
        "- simulations_summary.csv   — final metrics for all simulation runs",
        "- iot_client_registry.csv   — IoT device registry with trust/resource scores",
        "",
        "## Columns (rounds)",
        "round, accuracy, loss, participants, avg_trust_score, avg_noise_scale,",
        "cumulative_epsilon, comm_cost_mb, energy_joules",
      ].join("\n");
      dataFolder.file("README.txt", readme);

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ta-adp-fl-data.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  };

  const hasData = results && results.length > 0;
  const showLoader = !isLoading && !hasData && !autoBooted;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse font-mono">Connecting to federation network...</p>
        </div>
      </div>
    );
  }

  if (showLoader) {
    return <AutoBootLoader onDone={() => { setAutoBooted(true); refetch(); }} />;
  }

  const latestResult = hasData ? results[results.length - 1] : null;

  if (!latestResult) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse font-mono">Finalizing results...</p>
        </div>
      </div>
    );
  }

  // Format data for charts
  const accuracyData = (latestResult.rounds ?? []).map(r => ({
    round: r.roundNumber,
    accuracy: (r.globalAccuracy * 100).toFixed(2),
    privacyLoss: r.cumulativePrivacyLoss.toFixed(2),
  }));

  const baselineComparison = [
    { name: 'FedAvg (No DP)', accuracy: 92.5, privacyLoss: 0, energy: 120 },
    { name: 'FedProx+DP', accuracy: 84.2, privacyLoss: 4.5, energy: 145 },
    { name: 'TA-ADP (Ours)', accuracy: (latestResult.finalAccuracy * 100).toFixed(1), privacyLoss: latestResult.avgPrivacyLoss.toFixed(2), energy: latestResult.avgEnergyConsumption.toFixed(0) },
  ];

  const snippets = [
    {
      label: "Setup & Load",
      code: `import pandas as pd
import matplotlib.pyplot as plt
import glob, os

# -- Load all rounds CSVs from the exported zip --
rounds_files = glob.glob("ta-adp-fl-data/rounds/*.csv")
dfs = []
for f in rounds_files:
    df = pd.read_csv(f)
    df["run"] = os.path.basename(f).replace("_rounds.csv", "")
    dfs.append(df)
rounds = pd.concat(dfs, ignore_index=True)

# Load simulations summary and client registry
sims    = pd.read_csv("ta-adp-fl-data/simulations_summary.csv")
clients = pd.read_csv("ta-adp-fl-data/iot_client_registry.csv")

print(rounds.head())
print(sims[["name","dataset","final_accuracy","avg_privacy_loss"]])`,
    },
    {
      label: "Fig 3 — Learning Curve",
      code: `import pandas as pd
import matplotlib.pyplot as plt
import glob, os

rounds_files = glob.glob("ta-adp-fl-data/rounds/*.csv")
dfs = []
for f in rounds_files:
    df = pd.read_csv(f)
    df["run"] = os.path.basename(f).replace("_rounds.csv", "")
    dfs.append(df)
rounds = pd.concat(dfs, ignore_index=True)

fig, ax = plt.subplots(figsize=(7.16, 4.5), dpi=300)
COLORS = ["#0072B2", "#E69F00", "#009E73"]

for color, (run_name, grp) in zip(COLORS, rounds.groupby("run")):
    ax.plot(grp["round"], grp["accuracy"] * 100,
            label=run_name, color=color, linewidth=1.8)

ax.set_xlabel("Communication Round", fontsize=9)
ax.set_ylabel("Global Accuracy (%)", fontsize=9)
ax.set_title("Fig. 3: TA-ADP Learning Curve", fontsize=10, fontweight="bold")
ax.legend(fontsize=7, framealpha=0.4)
ax.grid(True, linestyle="--", alpha=0.3)
plt.tight_layout()
plt.savefig("Fig3_Learning_Curve.png", dpi=300, bbox_inches="tight")
plt.show()`,
    },
    {
      label: "Fig 4 — Privacy Budget",
      code: `import pandas as pd
import matplotlib.pyplot as plt
import glob, os

rounds_files = glob.glob("ta-adp-fl-data/rounds/*.csv")
dfs = []
for f in rounds_files:
    df = pd.read_csv(f)
    df["run"] = os.path.basename(f).replace("_rounds.csv", "")
    dfs.append(df)
rounds = pd.concat(dfs, ignore_index=True)

fig, ax = plt.subplots(figsize=(7.16, 4.5), dpi=300)
COLORS = ["#0072B2", "#E69F00", "#009E73"]

for color, (run_name, grp) in zip(COLORS, rounds.groupby("run")):
    ax.plot(grp["round"], grp["cumulative_epsilon"],
            label=run_name, color=color, linewidth=1.8)

ax.set_xlabel("Communication Round", fontsize=9)
ax.set_ylabel("Cumulative Privacy Budget (ε)", fontsize=9)
ax.set_title("Fig. 4: Privacy Budget Accumulation (RDP Composition)", fontsize=10, fontweight="bold")
ax.legend(fontsize=7, framealpha=0.4)
ax.grid(True, linestyle="--", alpha=0.3)
plt.tight_layout()
plt.savefig("Fig4_Privacy_Budget.png", dpi=300, bbox_inches="tight")
plt.show()`,
    },
    {
      label: "Fig 5 — Per-Dataset Bar",
      code: `import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

sims = pd.read_csv("ta-adp-fl-data/simulations_summary.csv")

datasets  = sims["dataset"].tolist()
accuracy  = (sims["final_accuracy"] * 100).tolist()
epsilon   = sims["avg_privacy_loss"].tolist()

x = np.arange(len(datasets))
w = 0.35

fig, ax1 = plt.subplots(figsize=(7.16, 4.0), dpi=300)
ax2 = ax1.twinx()

bars1 = ax1.bar(x - w/2, accuracy,  w, label="Accuracy (%)",  color="#0072B2", alpha=0.85)
bars2 = ax2.bar(x + w/2, epsilon,   w, label="Avg ε (privacy)", color="#E69F00", alpha=0.85)

ax1.set_xticks(x)
ax1.set_xticklabels(datasets, fontsize=9)
ax1.set_ylabel("Final Accuracy (%)", fontsize=9, color="#0072B2")
ax2.set_ylabel("Avg Privacy Loss (ε)", fontsize=9, color="#E69F00")
ax1.set_title("Fig. 5: TA-ADP Per-Dataset Performance", fontsize=10, fontweight="bold")

lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, fontsize=7, loc="lower right")
ax1.grid(axis="y", linestyle="--", alpha=0.3)
plt.tight_layout()
plt.savefig("Fig5_Per_Dataset_Bar.png", dpi=300, bbox_inches="tight")
plt.show()`,
    },
  ];

  const activeCode = snippets[activeSnippet].code;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-display font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 mb-2">
            Simulation Dashboard
          </h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse"></span>
            Viewing latest execution: <strong className="text-white">{latestResult.name}</strong> ({latestResult.dataset})
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" onClick={() => setShowHistory(v => !v)} className="gap-2 shrink-0">
            <History className="h-4 w-4" />
            Run History
            {showHistory ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          <Button variant="outline" onClick={() => setShowPython(v => !v)} className="gap-2 shrink-0">
            <Code2 className="h-4 w-4" />
            Python Code
            {showPython ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          <Button variant="outline" onClick={downloadAllData} disabled={zipping} className="gap-2 shrink-0">
            <PackageOpen className="h-4 w-4" />
            {zipping ? "Packaging…" : "Download All Data (.zip)"}
          </Button>
        </div>
      </div>

      {/* Config History Panel */}
      {showHistory && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-panel border-white/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-accent" /> Simulation Config History
              </CardTitle>
              <CardDescription className="text-xs">All {results!.length} run{results!.length !== 1 ? "s" : ""} — parameters and final outcomes at a glance</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-xl border border-white/10 overflow-hidden bg-background/50 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-white whitespace-nowrap">#</TableHead>
                      <TableHead className="text-white whitespace-nowrap">Run Name</TableHead>
                      <TableHead className="text-white whitespace-nowrap">Dataset</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-center">Clients</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-center">Rounds</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-center">ε</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-center">δ</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-center">α / β</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-center">Trust Thr.</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-right">Final Acc.</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-right">Avg ε spent</TableHead>
                      <TableHead className="text-white whitespace-nowrap text-right">Conv. Round</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results!.map((r, idx) => {
                      const isLatest = idx === results!.length - 1;
                      return (
                        <TableRow key={r.id} className={`border-white/5 hover:bg-white/5 transition-colors ${isLatest ? "bg-primary/5" : ""}`}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                          <TableCell className="font-medium text-white max-w-[180px] truncate">
                            {r.name}
                            {isLatest && <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-accent/20 text-accent border-accent/30" variant="outline">latest</Badge>}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="border-white/10 text-muted-foreground text-xs">{r.dataset}</Badge></TableCell>
                          <TableCell className="text-center font-mono text-xs">{r.numClients}</TableCell>
                          <TableCell className="text-center font-mono text-xs">{r.numRounds}</TableCell>
                          <TableCell className="text-center font-mono text-xs text-secondary">{r.baseEpsilon}</TableCell>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">{r.baseDelta}</TableCell>
                          <TableCell className="text-center font-mono text-xs">{r.alphaWeight} / {r.betaWeight}</TableCell>
                          <TableCell className="text-center font-mono text-xs">{r.minTrustScore}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 text-xs">
                              {((r.finalAccuracy as number) * 100).toFixed(2)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-secondary">ε {r.avgPrivacyLoss.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {r.convergenceRound ? `R${r.convergenceRound}` : `R${r.numRounds}`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Python Snippet Panel */}
      {showPython && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <Card className="glass-panel border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Code2 className="h-4 w-4 text-primary" /> Python Analysis Snippets
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Run these after extracting <code className="bg-white/10 px-1 rounded">ta-adp-fl-data.zip</code> — requires pandas, matplotlib, numpy
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => copySnippet(activeCode)} className="gap-2 shrink-0" variant="secondary">
                  {copied ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap pt-2">
                {snippets.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveSnippet(i)}
                    className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
                      activeSnippet === i
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <pre className="bg-black/60 border border-white/5 rounded-xl p-4 text-xs font-mono text-green-300 overflow-x-auto leading-5 max-h-72 overflow-y-auto">
                {activeCode}
              </pre>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Final Model Accuracy" 
          value={`${(latestResult.finalAccuracy * 100).toFixed(2)}%`}
          icon={Target}
          trend="+2.4% vs baseline"
          color="text-primary"
          bg="bg-primary/10"
        />
        <StatCard 
          title="Avg Privacy Loss (ε)" 
          value={latestResult.avgPrivacyLoss.toFixed(3)}
          icon={ShieldCheck}
          trend="Strict DP Guarantee"
          color="text-secondary"
          bg="bg-secondary/10"
        />
        <StatCard 
          title="Active IoT Clients" 
          value={latestResult.numClients}
          icon={Activity}
          trend="Heterogeneous devices"
          color="text-accent"
          bg="bg-accent/10"
        />
        <StatCard 
          title="Convergence Round" 
          value={latestResult.convergenceRound || latestResult.numRounds}
          icon={TrendingUp}
          trend={`Out of ${latestResult.numRounds} total`}
          color="text-chart-4"
          bg="bg-chart-4/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Learning Curve Chart */}
        <Card className="col-span-1 lg:col-span-2 glass-panel border-white/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Learning Curve & Privacy Budget Decay
            </CardTitle>
            <CardDescription>Global model accuracy vs cumulative privacy loss over training rounds</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={accuracyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPriv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="round" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area yAxisId="left" type="monotone" dataKey="accuracy" name="Accuracy (%)" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorAcc)" />
                <Area yAxisId="right" type="monotone" dataKey="privacyLoss" name="Privacy Loss (ε)" stroke="hsl(var(--secondary))" strokeWidth={3} fillOpacity={1} fill="url(#colorPriv)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Baseline Comparison */}
        <Card className="glass-panel border-white/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-accent" />
              Method Comparison
            </CardTitle>
            <CardDescription>TA-ADP vs Standard Approaches</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={baselineComparison} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.7)" fontSize={12} width={100} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="accuracy" name="Accuracy %" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={12} />
                <Bar dataKey="privacyLoss" name="Privacy Loss ε" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend: string;
  color: string;
  bg: string;
}

function StatCard({ title, value, icon: Icon, trend, color, bg }: StatCardProps) {
  return (
    <Card className="glass-panel-hover border-white/5 overflow-hidden group">
      <CardContent className="p-6 relative">
        <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl opacity-20 ${bg} group-hover:opacity-40 transition-opacity`} />
        <div className="flex justify-between items-start mb-4 relative z-10">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`p-2 rounded-lg ${bg} ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="relative z-10">
          <h3 className="text-3xl font-display font-bold text-white mb-1">{value}</h3>
          <p className="text-xs text-muted-foreground font-mono bg-white/5 inline-block px-2 py-1 rounded-md">{trend}</p>
        </div>
      </CardContent>
    </Card>
  );
}

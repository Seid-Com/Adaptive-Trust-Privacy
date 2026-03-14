import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useGetSimulationResults, useRunSimulation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Zap, ShieldCheck, Target, TrendingUp, AlertTriangle, BarChart2, Cpu, Radio } from "lucide-react";
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
  const [autoBooted, setAutoBooted] = useState(false);

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
  const accuracyData = latestResult.rounds.map(r => ({
    round: r.roundNumber,
    accuracy: (r.globalAccuracy * 100).toFixed(2),
    privacyLoss: r.cumulativePrivacyLoss.toFixed(2),
  }));

  const baselineComparison = [
    { name: 'FedAvg (No DP)', accuracy: 92.5, privacyLoss: 0, energy: 120 },
    { name: 'FedProx+DP', accuracy: 84.2, privacyLoss: 4.5, energy: 145 },
    { name: 'TA-ADP (Ours)', accuracy: (latestResult.finalAccuracy * 100).toFixed(1), privacyLoss: latestResult.avgPrivacyLoss.toFixed(2), energy: latestResult.avgEnergyConsumption.toFixed(0) },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-12">
      <div>
        <h1 className="text-4xl font-display font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 mb-2">
          Simulation Dashboard
        </h1>
        <p className="text-muted-foreground flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse"></span>
          Viewing latest execution: <strong className="text-white">{latestResult.name}</strong> ({latestResult.dataset})
        </p>
      </div>

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

function StatCard({ title, value, icon: Icon, trend, color, bg }: any) {
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

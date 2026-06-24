import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGetSimulationResults } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, LayoutList, Download } from "lucide-react";

const PALETTE = [
  "#0072B2", "#E69F00", "#009E73", "#CC79A7",
  "#56B4E9", "#D55E00", "#F0E442", "#999999",
];

type Metric = "globalAccuracy" | "globalLoss" | "cumulativePrivacyLoss" | "avgNoiseScale";

const METRIC_OPTIONS: { key: Metric; label: string; fmt: (v: number) => string }[] = [
  { key: "globalAccuracy",        label: "Accuracy",          fmt: (v) => `${(v * 100).toFixed(2)}%` },
  { key: "globalLoss",            label: "Loss",              fmt: (v) => v.toFixed(4) },
  { key: "cumulativePrivacyLoss", label: "Cumulative ε",      fmt: (v) => v.toFixed(3) },
  { key: "avgNoiseScale",         label: "Avg Noise Scale σ", fmt: (v) => v.toFixed(3) },
];

export default function Rounds() {
  const { data: results, isLoading } = useGetSimulationResults();
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeMetric, setActiveMetric] = useState<Metric>("globalAccuracy");

  if (isLoading) return (
    <div className="p-8 text-center text-muted-foreground animate-pulse">Loading round telemetry...</div>
  );

  if (!results || results.length === 0) return (
    <div className="p-8 text-center text-muted-foreground">No round data available. Run a simulation first.</div>
  );

  const latestResult = results[results.length - 1];
  const roundsData = latestResult.rounds ?? [];

  const exportCsv = (sim: typeof latestResult) => {
    const rows = sim.rounds ?? [];
    const header = [
      "round,accuracy,loss,participants,avg_trust_score,avg_noise_scale,cumulative_epsilon,comm_cost_mb,energy_joules"
    ];
    const lines = rows.map((r) =>
      [
        r.roundNumber,
        r.globalAccuracy.toFixed(6),
        r.globalLoss.toFixed(6),
        r.numSelectedClients,
        r.avgTrustScore.toFixed(4),
        r.avgNoiseScale.toFixed(4),
        r.cumulativePrivacyLoss.toFixed(4),
        r.communicationCost.toFixed(2),
        r.energyConsumed.toFixed(4),
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(sim.name ?? "run").replace(/\s+/g, "_")}_rounds.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const activeResults = results.filter((r) => r.id !== undefined && selectedIds.has(r.id as number));

  const maxRounds = Math.max(...activeResults.map((r) => (r.rounds ?? []).length), 0);
  const comparisonData = Array.from({ length: maxRounds }, (_, i) => {
    const point: Record<string, number | string> = { round: i + 1 };
    activeResults.forEach((r) => {
      const rd = (r.rounds ?? [])[i];
      if (rd) point[String(r.id)] = rd[activeMetric] as number;
    });
    return point;
  });

  const metricInfo = METRIC_OPTIONS.find((m) => m.key === activeMetric)!;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-display font-bold text-white mb-2">Training Rounds Telemetry</h1>
          <p className="text-muted-foreground">Detailed metrics per global aggregation step.</p>
        </div>
        <Button
          variant={compareMode ? "default" : "outline"}
          onClick={() => {
            setCompareMode((v) => !v);
            setSelectedIds(new Set());
          }}
          className="gap-2"
        >
          {compareMode ? <LayoutList className="w-4 h-4" /> : <GitCompareArrows className="w-4 h-4" />}
          {compareMode ? "Single View" : "Comparison Mode"}
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {compareMode ? (
          <motion.div
            key="compare"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-6"
          >
            <Card className="glass-panel border-white/5">
              <CardHeader>
                <CardTitle>Select Runs to Compare</CardTitle>
                <CardDescription>Toggle simulations to overlay their learning curves on one chart.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {results.map((r, idx) => {
                    const id = r.id as number;
                    const selected = selectedIds.has(id);
                    const color = PALETTE[idx % PALETTE.length];
                    return (
                      <button
                        key={id}
                        onClick={() => toggleId(id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                          selected
                            ? "border-transparent text-white shadow-md"
                            : "border-white/10 text-muted-foreground hover:border-white/30 hover:text-white"
                        }`}
                        style={selected ? { backgroundColor: color + "33", borderColor: color } : {}}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: selected ? color : "rgba(255,255,255,0.2)" }}
                        />
                        <span>{r.name ?? `Run #${id}`}</span>
                        <span className="opacity-60 text-xs">
                          {r.dataset} · {(((r.finalAccuracy as number) ?? 0) * 100).toFixed(1)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {activeResults.length >= 1 && (
              <Card className="glass-panel border-white/5">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle>Multi-Run Overlay</CardTitle>
                      <CardDescription>{activeResults.length} simulation{activeResults.length > 1 ? "s" : ""} selected</CardDescription>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {METRIC_OPTIONS.map((m) => (
                        <Button
                          key={m.key}
                          size="sm"
                          variant={activeMetric === m.key ? "default" : "outline"}
                          onClick={() => setActiveMetric(m.key)}
                          className="text-xs h-7 px-3"
                        >
                          {m.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="round" stroke="rgba(255,255,255,0.3)" fontSize={12} label={{ value: "Round", position: "insideBottomRight", offset: -8, fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                      <YAxis
                        stroke="rgba(255,255,255,0.3)"
                        fontSize={12}
                        tickFormatter={metricInfo.fmt}
                        width={activeMetric === "globalAccuracy" ? 56 : 60}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "rgba(15,23,42,0.95)", borderColor: "rgba(255,255,255,0.1)", borderRadius: 8 }}
                        formatter={(val: number, name: string) => {
                          const r = results.find((x) => String(x.id) === name);
                          return [metricInfo.fmt(val), r?.name ?? name];
                        }}
                        labelFormatter={(l) => `Round ${l}`}
                      />
                      <Legend
                        formatter={(value) => {
                          const r = results.find((x) => String(x.id) === value);
                          return r?.name ?? value;
                        }}
                      />
                      {activeResults.map((r, idx) => (
                        <Line
                          key={r.id}
                          type="monotone"
                          dataKey={String(r.id)}
                          stroke={PALETTE[results.indexOf(r) % PALETTE.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {activeResults.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                Select at least one run above to see the comparison chart.
              </div>
            )}

            {activeResults.length >= 2 && (
              <Card className="glass-panel border-white/5">
                <CardHeader>
                  <CardTitle>Summary Comparison</CardTitle>
                  <CardDescription>Final metrics across selected runs</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-white/10 overflow-hidden bg-background/50">
                    <Table>
                      <TableHeader className="bg-card">
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-white">Run</TableHead>
                          <TableHead className="text-white">Dataset</TableHead>
                          <TableHead className="text-white">Final Acc.</TableHead>
                          <TableHead className="text-white">Final Loss</TableHead>
                          <TableHead className="text-white">Cum. ε</TableHead>
                          <TableHead className="text-white">Convergence</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeResults.map((r, idx) => {
                          const rounds = r.rounds ?? [];
                          const lastRound = rounds[rounds.length - 1];
                          const color = PALETTE[results.indexOf(r) % PALETTE.length];
                          return (
                            <TableRow key={r.id} className="border-white/5 hover:bg-white/5 transition-colors">
                              <TableCell className="flex items-center gap-2 font-medium">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                {r.name ?? `Run #${r.id}`}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="border-white/10 text-muted-foreground">{r.dataset}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
                                  {(((r.finalAccuracy as number) ?? 0) * 100).toFixed(2)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {((r.finalLoss as number) ?? 0).toFixed(4)}
                              </TableCell>
                              <TableCell className="font-mono text-secondary">
                                ε {lastRound?.cumulativePrivacyLoss?.toFixed(3) ?? "—"}
                              </TableCell>
                              <TableCell>
                                {r.convergenceRound ? `Round ${r.convergenceRound}` : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="single"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="glass-panel border-white/5">
                <CardHeader>
                  <CardTitle>Global Loss & Privacy Cost</CardTitle>
                  <CardDescription>Loss convergence versus cumulative epsilon — {latestResult.name}</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roundsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="roundNumber" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                      <YAxis yAxisId="left" stroke="rgba(255,255,255,0.3)" fontSize={12} domain={["auto", "auto"]} />
                      <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.9)", borderColor: "rgba(255,255,255,0.1)" }} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="globalLoss" name="Global Loss" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="cumulativePrivacyLoss" name="Cum. Epsilon" stroke="hsl(var(--secondary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/5">
                <CardHeader>
                  <CardTitle>Resource Utilization</CardTitle>
                  <CardDescription>Network communication and energy costs per round</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roundsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="roundNumber" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                      <YAxis yAxisId="left" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                      <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.9)", borderColor: "rgba(255,255,255,0.1)" }} />
                      <Legend />
                      <Line yAxisId="left" type="step" dataKey="communicationCost" name="Comm Cost (MB)" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <Line yAxisId="right" type="step" dataKey="energyConsumed" name="Energy (Joules)" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="glass-panel border-white/5">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Aggregated Round Data</CardTitle>
                    <CardDescription>{latestResult.name} · {roundsData.length} rounds</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => exportCsv(latestResult)} className="gap-2 shrink-0">
                    <Download className="w-4 h-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-white/10 overflow-hidden bg-background/50">
                  <Table>
                    <TableHeader className="bg-card">
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-white">Round</TableHead>
                        <TableHead className="text-white">Accuracy</TableHead>
                        <TableHead className="text-white">Loss</TableHead>
                        <TableHead className="text-white">Participants</TableHead>
                        <TableHead className="text-white">Avg Trust</TableHead>
                        <TableHead className="text-white">Avg Noise (σ)</TableHead>
                        <TableHead className="text-white text-right">Privacy Spent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roundsData.map((round) => (
                        <TableRow key={round.id} className="border-white/5 hover:bg-white/5 transition-colors">
                          <TableCell className="font-mono text-primary">#{round.roundNumber}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
                              {(round.globalAccuracy * 100).toFixed(2)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{round.globalLoss.toFixed(4)}</TableCell>
                          <TableCell>{round.numSelectedClients}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-accent" style={{ width: `${round.avgTrustScore * 100}%` }} />
                              </div>
                              <span className="text-xs">{round.avgTrustScore.toFixed(2)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{round.avgNoiseScale.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono text-secondary">ε {round.cumulativePrivacyLoss.toFixed(3)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

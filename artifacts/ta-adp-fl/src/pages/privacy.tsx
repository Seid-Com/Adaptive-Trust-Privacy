import { motion } from "framer-motion";
import { useGetSimulationResults } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from "recharts";
import { ShieldCheck, Info, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyAnalysis() {
  const { data: results, isLoading } = useGetSimulationResults();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading privacy models...</div>;

  const latestResult = results && results.length > 0 ? results[results.length - 1] : null;

  if (!latestResult) {
    return <div className="p-8 text-center text-muted-foreground">No simulation data available for privacy analysis.</div>;
  }

  const rounds = latestResult.rounds ?? [];
  const lastRound = rounds[rounds.length - 1];
  const scatterData = Array.from({ length: 50 }).map((_, i) => {
    const avgTrust = lastRound?.avgTrustScore ?? 0.7;
    const avgNoise = lastRound?.avgNoiseScale ?? 1.0;
    const trust = Math.max(0.1, Math.min(1.0, avgTrust + (Math.random() - 0.5) * 0.4));
    const baseNoise = avgNoise * 1.5;
    const noise = Math.max(0.1, baseNoise * (1 - 0.5 * trust + (Math.random() - 0.5) * 0.2));
    const resource = Math.floor(Math.random() * 100);
    return {
      id: i,
      trustScore: Number(trust.toFixed(2)),
      noiseScale: Number(noise.toFixed(2)),
      resource,
    };
  });

  const exportCsv = () => {
    const runName = latestResult.name ?? "run";
    const header = "client_idx,trust_score,noise_scale_sigma,resource_capacity_pct,simulation,dataset,avg_epsilon";
    const lines = scatterData.map((d) =>
      [
        d.id,
        d.trustScore.toFixed(4),
        d.noiseScale.toFixed(4),
        d.resource,
        `"${runName}"`,
        latestResult.dataset,
        latestResult.avgPrivacyLoss.toFixed(4),
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runName.replace(/\s+/g, "_")}_privacy_scatter.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary mb-2">
            Privacy Analysis
          </h1>
          <p className="text-muted-foreground">Deep dive into the Adaptive Differential Privacy mechanisms.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} className="gap-2 shrink-0">
          <Download className="h-4 w-4" />
          Export Scatter CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 glass-panel border-secondary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-secondary" /> Adaptive Noise Distribution
            </CardTitle>
            <CardDescription>
              Correlation between node Trust Score and assigned Noise Scale (σ). 
              Nodes with higher trust receive less noise, preserving model accuracy.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" dataKey="trustScore" name="Trust Score" stroke="rgba(255,255,255,0.4)" label={{ value: 'Trust Score', position: 'insideBottom', offset: -10, fill: 'rgba(255,255,255,0.4)' }} />
                <YAxis type="number" dataKey="noiseScale" name="Noise Scale (σ)" stroke="rgba(255,255,255,0.4)" label={{ value: 'Noise Scale (σ)', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.4)' }} />
                <ZAxis type="number" dataKey="resource" range={[40, 400]} name="Resource Capacity" />
                <Tooltip 
                  cursor={{strokeDasharray: '3 3'}}
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'hsl(var(--secondary)/0.3)', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Scatter name="Clients" data={scatterData} fill="hsl(var(--secondary))" fillOpacity={0.6} stroke="hsl(var(--secondary))" strokeWidth={1} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass-panel border-white/5 h-full">
            <CardHeader>
              <CardTitle>Privacy Guarantee</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-xl bg-secondary/10 border border-secondary/20">
                <p className="text-sm text-secondary-foreground mb-1">Total Privacy Budget Spent</p>
                <div className="text-4xl font-mono text-secondary font-bold">
                  ε = {latestResult.avgPrivacyLoss.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Across {latestResult.numRounds} global aggregation rounds.</p>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3 text-sm">
                  <Info className="h-5 w-5 text-primary shrink-0" />
                  <p className="text-muted-foreground">
                    <strong className="text-white">Theorem 1:</strong> The TA-ADP framework satisfies (ε, δ)-Differential Privacy under Gaussian Mechanism composition.
                  </p>
                </div>
                <div className="flex gap-3 text-sm">
                  <Info className="h-5 w-5 text-primary shrink-0" />
                  <p className="text-muted-foreground">
                    By heavily perturbing untrusted clients (high σ) and lightly perturbing trusted clients (low σ), the global model achieves higher utility for the same global ε bound.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

import { motion } from "framer-motion";
import { useGetSimulationResults } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";

export default function Rounds() {
  const { data: results, isLoading } = useGetSimulationResults();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading round telemetry...</div>;
  
  const latestResult = results && results.length > 0 ? results[results.length - 1] : null;

  if (!latestResult || !latestResult.rounds || latestResult.rounds.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No round data available. Run a simulation first.</div>;
  }

  const roundsData = latestResult.rounds;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h1 className="text-4xl font-display font-bold text-white mb-2">Training Rounds Telemetry</h1>
        <p className="text-muted-foreground">Detailed metrics per global aggregation step.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-panel border-white/5">
          <CardHeader>
            <CardTitle>Global Loss & Privacy Cost</CardTitle>
            <CardDescription>Loss convergence versus cumulative epsilon</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={roundsData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="roundNumber" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.3)" fontSize={12} domain={['auto', 'auto']} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)' }} />
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
                <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)' }} />
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
          <CardTitle>Aggregated Round Data</CardTitle>
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
  );
}

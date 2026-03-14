import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetSimulationConfig, useUpdateSimulationConfig, useRunSimulation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Play, Database, Shield, Zap, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

const configSchema = z.object({
  numClients: z.coerce.number().min(10).max(1000),
  numRounds: z.coerce.number().min(1).max(200),
  baseEpsilon: z.coerce.number().min(0.1).max(10),
  baseDelta: z.coerce.number().min(0.00001).max(0.1),
  minTrustScore: z.coerce.number().min(0).max(1),
  resourceThreshold: z.coerce.number().min(0).max(1),
  alphaWeight: z.coerce.number().min(0).max(1),
  betaWeight: z.coerce.number().min(0).max(1),
  dataset: z.enum(["TON-IoT", "Edge-IIoTset", "Bot-IoT"]),
});

export default function Simulation() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isRunning, setIsRunning] = useState(false);
  const [simName, setSimName] = useState(`Run-${Math.floor(Math.random()*1000)}`);

  const { data: currentConfig, isLoading: isLoadingConfig } = useGetSimulationConfig();
  const updateConfig = useUpdateSimulationConfig();
  const runSim = useRunSimulation();

  const form = useForm<z.infer<typeof configSchema>>({
    resolver: zodResolver(configSchema),
    values: currentConfig || {
      numClients: 100, numRounds: 50, baseEpsilon: 2.0, baseDelta: 0.001,
      minTrustScore: 0.5, resourceThreshold: 0.3, alphaWeight: 0.6, betaWeight: 0.4,
      dataset: "TON-IoT"
    }
  });

  const onSubmit = async (data: z.infer<typeof configSchema>) => {
    try {
      setIsRunning(true);
      // 1. Update config
      await updateConfig.mutateAsync({ data });
      
      toast({ title: "Configuration Saved", description: "Initializing simulation engine..." });

      // 2. Run simulation
      const result = await runSim.mutateAsync({ 
        data: { name: simName, configId: null } 
      });

      toast({ 
        title: "Simulation Complete", 
        description: `Model converged at round ${result.convergenceRound || result.numRounds} with ${(result.finalAccuracy*100).toFixed(1)}% accuracy.`,
        variant: "default",
      });
      
      setLocation("/");
    } catch (error) {
      toast({ 
        title: "Simulation Failed", 
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
      setIsRunning(false);
    }
  };

  if (isLoadingConfig) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading engine parameters...</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-display font-extrabold text-white mb-2">Simulation Engine</h1>
        <p className="text-muted-foreground">Configure and execute Trust-Aware Adaptive Differential Privacy federated learning tasks.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <form id="sim-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="glass-panel border-white/10">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="flex items-center gap-2 text-xl"><Settings className="text-primary h-5 w-5" /> Network Parameters</CardTitle>
                <CardDescription>Define the IoT network topology and training duration.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>Number of IoT Clients ({form.watch("numClients")})</Label>
                  <Slider 
                    min={10} max={500} step={10} 
                    value={[form.watch("numClients")]} 
                    onValueChange={(v) => form.setValue("numClients", v[0])} 
                    className="py-2"
                  />
                </div>
                <div className="space-y-3">
                  <Label>Training Rounds ({form.watch("numRounds")})</Label>
                  <Slider 
                    min={1} max={150} step={1} 
                    value={[form.watch("numRounds")]} 
                    onValueChange={(v) => form.setValue("numRounds", v[0])} 
                  />
                </div>
                <div className="space-y-3">
                  <Label>Dataset</Label>
                  <Select value={form.watch("dataset")} onValueChange={(v: any) => form.setValue("dataset", v)}>
                    <SelectTrigger className="bg-background/50 border-white/10"><SelectValue placeholder="Select dataset" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TON-IoT">TON-IoT (Network Traffic)</SelectItem>
                      <SelectItem value="Edge-IIoTset">Edge-IIoTset (Industrial)</SelectItem>
                      <SelectItem value="Bot-IoT">Bot-IoT (Malware)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label>Run Name identifier</Label>
                  <Input value={simName} onChange={(e) => setSimName(e.target.value)} className="bg-background/50 border-white/10 font-mono" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-white/10">
              <CardHeader className="border-b border-white/5 pb-4">
                <CardTitle className="flex items-center gap-2 text-xl"><Shield className="text-secondary h-5 w-5" /> TA-ADP Algorithm Settings</CardTitle>
                <CardDescription>Configure adaptive noise scaling and trust mechanisms (Eq. 5 & 6).</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <Label className="flex justify-between"><span>Trust Weight (α)</span> <span className="font-mono text-primary">{form.watch("alphaWeight").toFixed(2)}</span></Label>
                    <p className="text-xs text-muted-foreground mb-2">Influence of node reliability on noise reduction.</p>
                    <Slider min={0} max={1} step={0.05} value={[form.watch("alphaWeight")]} onValueChange={(v) => form.setValue("alphaWeight", v[0])} />
                  </div>
                  <div>
                    <Label className="flex justify-between"><span>Resource Weight (β)</span> <span className="font-mono text-primary">{form.watch("betaWeight").toFixed(2)}</span></Label>
                    <p className="text-xs text-muted-foreground mb-2">Influence of compute capacity on noise reduction.</p>
                    <Slider min={0} max={1} step={0.05} value={[form.watch("betaWeight")]} onValueChange={(v) => form.setValue("betaWeight", v[0])} />
                  </div>
                </div>

                <div className="space-y-4 border-l border-white/5 pl-6">
                  <div>
                    <Label className="flex justify-between"><span>Base Privacy Budget (ε)</span> <span className="font-mono text-secondary">{form.watch("baseEpsilon").toFixed(1)}</span></Label>
                    <Slider min={0.5} max={8.0} step={0.5} value={[form.watch("baseEpsilon")]} onValueChange={(v) => form.setValue("baseEpsilon", v[0])} />
                  </div>
                  <div>
                    <Label className="flex justify-between"><span>Min Trust Threshold</span> <span className="font-mono text-accent">{form.watch("minTrustScore").toFixed(2)}</span></Label>
                    <Slider min={0.1} max={0.9} step={0.1} value={[form.watch("minTrustScore")]} onValueChange={(v) => form.setValue("minTrustScore", v[0])} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>

        <div className="space-y-6">
          <Card className="glass-panel border-primary/20 shadow-[0_0_30px_-5px_rgba(6,182,212,0.15)] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap className="h-32 w-32 text-primary" />
            </div>
            <CardHeader>
              <CardTitle>Execution Control</CardTitle>
              <CardDescription>Ready to dispatch model to edge nodes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-background/50 rounded-lg p-4 font-mono text-xs text-muted-foreground space-y-2 mb-6 border border-white/5">
                <p>sigma_i = σ_max * (1 - α*T_i - β*R_i)</p>
                <p className="text-primary mt-2">{`> Selected Dataset: ${form.watch("dataset")}`}</p>
                <p>{`> Client Pool: ${form.watch("numClients")} nodes`}</p>
                <p>{`> Global Epochs: ${form.watch("numRounds")}`}</p>
                <p>{`> Status: IDLE`}</p>
              </div>
              <Button 
                type="submit" 
                form="sim-form"
                disabled={isRunning}
                className="w-full h-14 text-lg font-bold glow-primary relative group overflow-hidden"
              >
                {isRunning ? (
                  <>
                    <div className="absolute inset-0 bg-primary/20 flex w-full">
                      <motion.div 
                        initial={{ x: "-100%" }} animate={{ x: "100%" }} 
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12" 
                      />
                    </div>
                    <span className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"/> Processing...</span>
                  </>
                ) : (
                  <span className="flex items-center gap-2 group-hover:scale-105 transition-transform"><Play fill="currentColor" className="h-5 w-5" /> Launch Simulation</span>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-secondary/5 border-secondary/20">
            <CardContent className="p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
              <p className="text-sm text-secondary-foreground/80">
                TA-ADP dynamically adjusts noise variance (<span className="font-mono">σ</span>) per client based on their historical trust score and available resources, achieving higher accuracy without sacrificing formal DP guarantees.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

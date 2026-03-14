import { useState } from "react";
import { motion } from "framer-motion";
import { useListClients, useCreateClient } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Server, Smartphone, Watch, Car, Factory, Battery, Wifi, Cpu } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getListClientsQueryKey } from "@workspace/api-client-react";

const clientTypes = {
  sensor: { icon: Server, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
  wearable: { icon: Watch, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
  industrial: { icon: Factory, color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20" },
  vehicle: { icon: Car, color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
  gateway: { icon: Smartphone, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
};

const createSchema = z.object({
  name: z.string().min(3),
  deviceType: z.enum(["sensor", "wearable", "industrial", "vehicle", "gateway"]),
  trustScore: z.coerce.number().min(0).max(1),
  computeCapacity: z.coerce.number().min(0.1).max(10),
  batteryLevel: z.coerce.number().min(1).max(100),
  bandwidthMbps: z.coerce.number().min(1).max(1000),
});

export default function Clients() {
  const { data: clients, isLoading } = useListClients();
  const createMutation = useCreateClient();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { trustScore: 0.8, computeCapacity: 1.0, batteryLevel: 100, bandwidthMbps: 50, deviceType: "sensor" }
  });

  const onSubmit = async (data: z.infer<typeof createSchema>) => {
    await createMutation.mutateAsync({ data });
    queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
    setIsOpen(false);
    form.reset();
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading device registry...</div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-white mb-2">IoT Client Registry</h1>
          <p className="text-muted-foreground">Manage heterogeneous devices participating in federated learning.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="glow-primary"><Plus className="mr-2 h-4 w-4" /> Register Device</Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-white/10 sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Register IoT Edge Node</DialogTitle>
              <DialogDescription>Add a new device to the heterogeneous FL pool.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Device Name</Label>
                <Input {...form.register("name")} className="bg-background/50 border-white/10" placeholder="e.g. Edge-Node-001" />
              </div>
              <div className="space-y-2">
                <Label>Device Type</Label>
                <Select onValueChange={(v: any) => form.setValue("deviceType", v)} defaultValue={form.watch("deviceType")}>
                  <SelectTrigger className="bg-background/50 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(clientTypes).map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Initial Trust Score (0-1)</Label>
                  <Input type="number" step="0.1" {...form.register("trustScore")} className="bg-background/50 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label>Compute (TFLOPS)</Label>
                  <Input type="number" step="0.1" {...form.register("computeCapacity")} className="bg-background/50 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label>Battery (%)</Label>
                  <Input type="number" {...form.register("batteryLevel")} className="bg-background/50 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label>Bandwidth (Mbps)</Label>
                  <Input type="number" {...form.register("bandwidthMbps")} className="bg-background/50 border-white/10" />
                </div>
              </div>
              <Button type="submit" className="w-full mt-4" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Registering..." : "Register Device"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {clients?.map((client) => {
          const typeStyle = clientTypes[client.deviceType as keyof typeof clientTypes] || clientTypes.sensor;
          const Icon = typeStyle.icon;
          
          return (
            <motion.div key={client.id} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }}>
              <Card className={`glass-panel-hover border ${typeStyle.border} overflow-hidden h-full flex flex-col`}>
                <CardContent className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded-lg ${typeStyle.bg} ${typeStyle.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant={client.isActive ? "default" : "secondary"} className={client.isActive ? "bg-accent text-accent-foreground hover:bg-accent/80" : ""}>
                      {client.isActive ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  
                  <h3 className="font-bold text-lg text-white mb-1 truncate">{client.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize mb-4 font-mono">{client.deviceType} Node</p>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Trust Score</span>
                        <span className={client.trustScore > 0.7 ? "text-accent" : client.trustScore > 0.4 ? "text-yellow-400" : "text-destructive"}>
                          {client.trustScore.toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${client.trustScore > 0.7 ? "bg-accent" : client.trustScore > 0.4 ? "bg-yellow-400" : "bg-destructive"}`} 
                          style={{ width: `${client.trustScore * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                      <div className="flex flex-col items-center p-2 bg-background/30 rounded-lg">
                        <Cpu className="h-3 w-3 text-muted-foreground mb-1" />
                        <span className="text-xs font-mono text-white">{client.computeCapacity.toFixed(1)}</span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-background/30 rounded-lg">
                        <Battery className="h-3 w-3 text-muted-foreground mb-1" />
                        <span className="text-xs font-mono text-white">{client.batteryLevel}%</span>
                      </div>
                      <div className="flex flex-col items-center p-2 bg-background/30 rounded-lg">
                        <Wifi className="h-3 w-3 text-muted-foreground mb-1" />
                        <span className="text-xs font-mono text-white">{client.bandwidthMbps}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

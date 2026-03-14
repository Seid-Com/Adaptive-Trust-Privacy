import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Shield, Cpu, Network } from "lucide-react";

export default function About() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-12 pb-12">
      
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden h-64 border border-white/10 shadow-2xl">
        <img 
          src={`${import.meta.env.BASE_URL}images/about-hero.png`} 
          alt="Neural Network over Smart City" 
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        <div className="absolute inset-0 p-8 flex flex-col justify-end">
          <Badge variant="outline" className="w-fit mb-3 bg-primary/20 text-primary border-primary/30 backdrop-blur-md">Research Prototype</Badge>
          <h1 className="text-4xl md:text-5xl font-display font-extrabold text-white leading-tight">
            Trust-Aware Adaptive Differential Privacy
          </h1>
          <p className="text-lg text-white/80 mt-2 max-w-2xl">
            A novel framework for secure federated learning in heterogeneous IoT environments.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FeatureCard 
          icon={Shield} 
          title="Adaptive Privacy" 
          desc="Dynamically scales noise variance based on individual client trust scores, preserving model utility." 
        />
        <FeatureCard 
          icon={Cpu} 
          title="Resource Aware" 
          desc="Selects clients based on compute capacity and battery life, preventing stragglers." 
        />
        <FeatureCard 
          icon={Network} 
          title="IoT Optimized" 
          desc="Reduces communication overhead while maintaining formal (ε, δ)-DP guarantees." 
        />
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-display font-bold text-white mb-4 border-b border-white/10 pb-2">The Challenge</h2>
          <p className="text-muted-foreground leading-relaxed">
            Federated Learning (FL) enables collaborative model training across distributed IoT devices without sharing raw data. However, applying standard Differential Privacy (DP) uniformly destroys model accuracy because it fails to account for the heterogeneous nature of IoT devices—some devices are highly reliable, while others are prone to data poisoning or dropouts.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-display font-bold text-white mb-4 border-b border-white/10 pb-2">Our Solution (TA-ADP)</h2>
          <Card className="glass-panel border-primary/20 bg-primary/5 mb-6">
            <CardContent className="p-6">
              <h3 className="font-mono text-primary font-bold mb-2">Adaptive Noise Equation</h3>
              <div className="bg-background rounded-lg p-4 font-mono text-center text-lg border border-white/5 shadow-inner">
                σ<sub className="text-xs">i</sub> = σ<sub className="text-xs">max</sub> × (1 - α·T<sub className="text-xs">i</sub> - β·R<sub className="text-xs">i</sub>)
              </div>
              <ul className="mt-4 text-sm text-muted-foreground space-y-2 list-disc list-inside px-4">
                <li><strong className="text-white">σ<sub className="text-xs">max</sub></strong>: Maximum required noise variance for strict DP.</li>
                <li><strong className="text-white">T<sub className="text-xs">i</sub></strong>: Historical trust score of client <i>i</i> (0 to 1).</li>
                <li><strong className="text-white">R<sub className="text-xs">i</sub></strong>: Normalized resource capacity of client <i>i</i>.</li>
                <li><strong className="text-white">α, β</strong>: Tuning weights controlling the influence of trust and resources.</li>
              </ul>
            </CardContent>
          </Card>
          <p className="text-muted-foreground leading-relaxed">
            By scaling the noise inversely proportional to a client's trustworthiness and capability, TA-ADP injects less noise into updates from reliable nodes, dramatically improving global model convergence while providing rigorous mathematical privacy guarantees over the entire network.
          </p>
        </section>
      </div>
    </motion.div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: any) {
  return (
    <Card className="glass-panel border-white/5 hover:border-white/10 transition-colors">
      <CardContent className="p-6">
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-4">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </CardContent>
    </Card>
  );
}

// Simple Badge component inline since it's not imported above
function Badge({ children, className, variant = "default" }: any) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
      {children}
    </span>
  );
}

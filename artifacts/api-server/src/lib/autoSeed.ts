import { db } from "@workspace/db";
import { simulationsTable } from "@workspace/db/schema";
import { count } from "drizzle-orm";
import { seedClientsIfEmpty, runSimulation, type SimulationConfig } from "./simulation-engine";

const SEED_CONFIGS: SimulationConfig[] = [
  { name: "TA-ADP Auto-Run — TON-IoT", dataset: "TON-IoT", numClients: 20, numRounds: 50, baseEpsilon: 1.0, baseDelta: 1e-5, minTrustScore: 0.3, resourceThreshold: 0.2, alphaWeight: 0.5, betaWeight: 0.3 },
  { name: "TA-ADP Auto-Run — Edge-IIoTset", dataset: "Edge-IIoTset", numClients: 20, numRounds: 50, baseEpsilon: 1.0, baseDelta: 1e-5, minTrustScore: 0.3, resourceThreshold: 0.2, alphaWeight: 0.5, betaWeight: 0.3 },
  { name: "TA-ADP Auto-Run — Bot-IoT", dataset: "Bot-IoT", numClients: 20, numRounds: 50, baseEpsilon: 0.5, baseDelta: 1e-5, minTrustScore: 0.4, resourceThreshold: 0.3, alphaWeight: 0.6, betaWeight: 0.3 },
];

export async function autoSeed() {
  try {
    const [row] = await db.select({ count: count() }).from(simulationsTable);
    if (row.count > 0) {
      console.log(`[autoSeed] ${row.count} simulations already exist — skipping auto-seed.`);
      return;
    }
    console.log("[autoSeed] No simulations found. Running autonomous TA-ADP initialization...");
    await seedClientsIfEmpty(20);
    for (const cfg of SEED_CONFIGS) {
      console.log(`[autoSeed] Starting: "${cfg.name}" (${cfg.numRounds} rounds, dataset=${cfg.dataset})`);
      const result = await runSimulation(cfg);
      console.log(`[autoSeed] Completed: "${cfg.name}" | acc=${result.finalAccuracy.toFixed(4)} | rounds=${cfg.numRounds}`);
    }
    console.log("[autoSeed] All 3 simulations complete. Dashboard is ready.");
  } catch (err) {
    console.error("[autoSeed] Error during auto-seed:", err);
  }
}

import { db } from "@workspace/db";
import { simulationsTable, flRoundsTable, clientUpdatesTable, iotClientsTable } from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";

const SEED_CONFIGS = [
  { name: "TA-ADP Auto-Run — TON-IoT",        dataset: "TON-IoT",       numRounds: 50, baseEpsilon: 1.0, baseDelta: 1e-5, minTrustScore: 0.3, resourceThreshold: 0.2, alphaWeight: 0.5, betaWeight: 0.3 },
  { name: "TA-ADP Auto-Run — Edge-IIoTset",   dataset: "Edge-IIoTset",  numRounds: 50, baseEpsilon: 1.0, baseDelta: 1e-5, minTrustScore: 0.3, resourceThreshold: 0.2, alphaWeight: 0.5, betaWeight: 0.3 },
  { name: "TA-ADP Auto-Run — Bot-IoT",        dataset: "Bot-IoT",       numRounds: 50, baseEpsilon: 0.5, baseDelta: 1e-5, minTrustScore: 0.4, resourceThreshold: 0.3, alphaWeight: 0.6, betaWeight: 0.3 },
];

const DEVICE_TYPES = ["sensor", "wearable", "industrial", "vehicle", "gateway"] as const;

function rc() { return Math.round(Math.random() * 100) / 100; }

async function seedClients(n: number) {
  const existing = await db.select({ count: count() }).from(iotClientsTable);
  if (existing[0].count > 0) return;
  const rows = Array.from({ length: n }, (_, i) => ({
    name: `IoT-Device-${String(i + 1).padStart(3, "0")}`,
    deviceType: DEVICE_TYPES[i % DEVICE_TYPES.length],
    trustScore:       Math.round((0.3 + Math.random() * 0.7) * 100) / 100,
    computeCapacity:  Math.round((0.1 + Math.random() * 0.9) * 100) / 100,
    batteryLevel:     Math.round((0.2 + Math.random() * 0.8) * 100) / 100,
    bandwidthMbps:    Math.round((1 + Math.random() * 99) * 10) / 10,
    isActive: true,
  }));
  await db.insert(iotClientsTable).values(rows);
}

function resourceCapacity(c: { computeCapacity: number; batteryLevel: number; bandwidthMbps: number }) {
  const bwNorm = Math.min(c.bandwidthMbps / 100, 1);
  return c.computeCapacity * 0.4 + c.batteryLevel * 0.3 + bwNorm * 0.3;
}

function noiseScale(trust: number, res: number, sigMax: number, alpha: number, beta: number) {
  return sigMax * Math.max(0.1, 1 - alpha * trust - beta * res);
}

async function runSim(cfg: typeof SEED_CONFIGS[number]) {
  const clients = await db.select().from(iotClientsTable).where(eq(iotClientsTable.isActive, true));

  const [sim] = await db.insert(simulationsTable).values({
    name: cfg.name, dataset: cfg.dataset,
    numClients: clients.length, numRounds: cfg.numRounds,
    baseEpsilon: cfg.baseEpsilon, baseDelta: cfg.baseDelta,
    minTrustScore: cfg.minTrustScore, resourceThreshold: cfg.resourceThreshold,
    alphaWeight: cfg.alphaWeight, betaWeight: cfg.betaWeight,
    finalAccuracy: 0, finalLoss: 0, avgPrivacyLoss: 0,
    avgCommunicationCost: 0, avgEnergyConsumption: 0,
  }).returning();

  let accuracy = 0.45 + Math.random() * 0.1;
  let loss = 1.2 + Math.random() * 0.3;
  let cumPrivacy = 0;
  let convergenceRound: number | null = null;
  const sigMax = 2.0;
  const privacyArr: number[] = [];
  const commArr: number[] = [];
  const energyArr: number[] = [];

  for (let r = 1; r <= cfg.numRounds; r++) {
    const eligible = clients.filter(c =>
      c.trustScore >= cfg.minTrustScore &&
      resourceCapacity(c) >= cfg.resourceThreshold
    );
    const selected = eligible.slice(0, Math.max(3, Math.floor(eligible.length * 0.7)));

    const updates = clients.map(c => {
      const isSelected = selected.some(s => s.id === c.id);
      const res = resourceCapacity(c);
      const ns = noiseScale(c.trustScore, res, sigMax, cfg.alphaWeight, cfg.betaWeight);
      return {
        clientId: c.id, clientName: c.name, deviceType: c.deviceType,
        trustScore: c.trustScore, resourceCapacity: res, noiseScale: ns,
        localAccuracy: Math.min(0.99, accuracy + Math.random() * 0.02 * c.trustScore - 0.005),
        privacyBudgetUsed: cfg.baseEpsilon * ns,
        communicationBytes: Math.floor(500000 * (1 - ns * 0.3) + Math.random() * 50000),
        energyUsed: res * 0.5 + Math.random() * 0.1,
        selected: isSelected,
      };
    });

    const sel = updates.filter(u => u.selected);
    const avgTrust = sel.reduce((s, u) => s + u.trustScore, 0) / (sel.length || 1);
    const avgNoise = sel.reduce((s, u) => s + u.noiseScale, 0) / (sel.length || 1);
    const avgComm  = sel.reduce((s, u) => s + u.communicationBytes, 0) / (sel.length || 1);
    const avgEnergy = sel.reduce((s, u) => s + u.energyUsed, 0) / (sel.length || 1);

    const cf = r / cfg.numRounds;
    accuracy = Math.min(0.97, accuracy + 0.015 * (1 - cf) * avgTrust + 0.002 + (Math.random() - 0.5) * 0.005);
    loss     = Math.max(0.05, loss - 0.02 * (1 - cf) - 0.003 + (Math.random() - 0.5) * 0.005);
    cumPrivacy += cfg.baseEpsilon * avgNoise;

    if (!convergenceRound && accuracy >= 0.90) convergenceRound = r;

    const [rnd] = await db.insert(flRoundsTable).values({
      simulationId: sim.id, roundNumber: r,
      globalAccuracy: accuracy, globalLoss: loss,
      numSelectedClients: selected.length,
      avgNoiseScale: avgNoise, avgTrustScore: avgTrust,
      cumulativePrivacyLoss: cumPrivacy,
      communicationCost: avgComm, energyConsumed: avgEnergy,
    }).returning();

    await db.insert(clientUpdatesTable).values(updates.map(u => ({ roundId: rnd.id, ...u })));

    privacyArr.push(cumPrivacy);
    commArr.push(avgComm);
    energyArr.push(avgEnergy);
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  await db.update(simulationsTable).set({
    finalAccuracy: accuracy, finalLoss: loss,
    avgPrivacyLoss: avg(privacyArr),
    avgCommunicationCost: avg(commArr),
    avgEnergyConsumption: avg(energyArr),
    convergenceRound,
  }).where(eq(simulationsTable.id, sim.id));

  console.log(`[autoSeed] Completed: "${cfg.name}" | acc=${accuracy.toFixed(4)} | rounds=${cfg.numRounds}`);
}

export async function autoSeed() {
  try {
    const [row] = await db.select({ count: count() }).from(simulationsTable);
    if (row.count > 0) {
      console.log(`[autoSeed] ${row.count} simulations already exist — skipping auto-seed.`);
      return;
    }
    console.log("[autoSeed] No simulations found. Running autonomous TA-ADP initialization...");
    await seedClients(20);
    for (const cfg of SEED_CONFIGS) {
      console.log(`[autoSeed] Starting: "${cfg.name}" (${cfg.numRounds} rounds, dataset=${cfg.dataset})`);
      await runSim(cfg);
    }
    console.log("[autoSeed] All 3 simulations complete. Dashboard is ready.");
  } catch (err) {
    console.error("[autoSeed] Error during auto-seed:", err);
  }
}

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  simulationsTable,
  flRoundsTable,
  clientUpdatesTable,
  iotClientsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_CONFIG = {
  numClients: 20,
  numRounds: 30,
  baseEpsilon: 1.0,
  baseDelta: 1e-5,
  minTrustScore: 0.3,
  resourceThreshold: 0.2,
  alphaWeight: 0.5,
  betaWeight: 0.3,
  dataset: "TON-IoT",
};

let currentConfig = { ...DEFAULT_CONFIG };

router.get("/config", (_req, res) => {
  res.json(currentConfig);
});

router.put("/config", (req, res) => {
  currentConfig = { ...currentConfig, ...req.body };
  res.json(currentConfig);
});

function computeNoiseScale(
  trustScore: number,
  resourceCapacity: number,
  sigmaMax: number,
  alpha: number,
  beta: number
): number {
  const scale = Math.max(0.1, 1 - alpha * trustScore - beta * resourceCapacity);
  return sigmaMax * scale;
}

function computeResourceCapacity(compute: number, battery: number, bandwidth: number): number {
  return (compute * 0.4 + battery * 0.3 + bandwidth * 0.3);
}

function simulateRound(
  round: number,
  clients: Array<{ id: number; name: string; deviceType: string; trustScore: number; computeCapacity: number; batteryLevel: number; bandwidthMbps: number }>,
  config: typeof DEFAULT_CONFIG,
  prevAccuracy: number,
  prevLoss: number,
  cumulativePrivacyLoss: number
) {
  const sigmaMax = 2.0;
  const eligible = clients.filter(
    (c) => c.trustScore >= config.minTrustScore && computeResourceCapacity(c.computeCapacity, c.batteryLevel, c.bandwidthMbps) >= config.resourceThreshold
  );

  const selected = eligible.slice(0, Math.max(3, Math.floor(eligible.length * 0.7)));

  const clientUpdates = clients.map((client) => {
    const isSelected = selected.some((s) => s.id === client.id);
    const resource = computeResourceCapacity(client.computeCapacity, client.batteryLevel, client.bandwidthMbps);
    const noiseScale = computeNoiseScale(client.trustScore, resource, sigmaMax, config.alphaWeight, config.betaWeight);
    const localAccuracy = Math.min(0.99, prevAccuracy + Math.random() * 0.02 * client.trustScore - 0.005);
    const privacyBudget = config.baseEpsilon * noiseScale;
    const commBytes = Math.floor(500000 * (1 - noiseScale * 0.3) + Math.random() * 50000);
    const energy = resource * 0.5 + Math.random() * 0.1;

    return {
      clientId: client.id,
      clientName: client.name,
      deviceType: client.deviceType,
      trustScore: client.trustScore,
      resourceCapacity: resource,
      noiseScale,
      localAccuracy,
      privacyBudgetUsed: privacyBudget,
      communicationBytes: commBytes,
      energyUsed: energy,
      selected: isSelected,
    };
  });

  const selectedUpdates = clientUpdates.filter((u) => u.selected);
  const avgTrust = selectedUpdates.reduce((s, u) => s + u.trustScore, 0) / (selectedUpdates.length || 1);
  const avgNoise = selectedUpdates.reduce((s, u) => s + u.noiseScale, 0) / (selectedUpdates.length || 1);
  const avgComm = selectedUpdates.reduce((s, u) => s + u.communicationBytes, 0) / (selectedUpdates.length || 1);
  const avgEnergy = selectedUpdates.reduce((s, u) => s + u.energyUsed, 0) / (selectedUpdates.length || 1);

  const convergenceFactor = round / config.numRounds;
  const accuracyGain = 0.015 * (1 - convergenceFactor) * avgTrust + 0.002;
  const newAccuracy = Math.min(0.97, prevAccuracy + accuracyGain + (Math.random() - 0.5) * 0.005);
  const newLoss = Math.max(0.05, prevLoss - 0.02 * (1 - convergenceFactor) - 0.003 + (Math.random() - 0.5) * 0.005);

  const roundPrivacyLoss = config.baseEpsilon * avgNoise;
  const newCumulativeLoss = cumulativePrivacyLoss + roundPrivacyLoss;

  return {
    roundData: {
      roundNumber: round,
      globalAccuracy: newAccuracy,
      globalLoss: newLoss,
      numSelectedClients: selected.length,
      avgNoiseScale: avgNoise,
      avgTrustScore: avgTrust,
      cumulativePrivacyLoss: newCumulativeLoss,
      communicationCost: avgComm,
      energyConsumed: avgEnergy,
    },
    clientUpdates,
  };
}

function autoDetectConfig(name: string | undefined): typeof DEFAULT_CONFIG {
  if (!name) return { ...currentConfig, numRounds: 50 };
  if (name.includes("Edge-IIoTset")) {
    return { ...DEFAULT_CONFIG, dataset: "Edge-IIoTset", numRounds: 50, alphaWeight: 0.5, betaWeight: 0.3, baseEpsilon: 1.0 };
  }
  if (name.includes("Bot-IoT")) {
    return { ...DEFAULT_CONFIG, dataset: "Bot-IoT", numRounds: 50, alphaWeight: 0.6, betaWeight: 0.3, baseEpsilon: 0.5, minTrustScore: 0.4 };
  }
  if (name.includes("TON-IoT")) {
    return { ...DEFAULT_CONFIG, dataset: "TON-IoT", numRounds: 50 };
  }
  return { ...currentConfig, numRounds: 50 };
}

router.post("/run", async (req, res) => {
  try {
    const body = req.body ?? {};
    const name: string = body.name ?? `Auto-Run ${new Date().toISOString()}`;
    const config = autoDetectConfig(name);

    let clients = await db.select().from(iotClientsTable).where(eq(iotClientsTable.isActive, true));
    if (clients.length === 0) {
      await seedClients(config.numClients);
      clients = await db.select().from(iotClientsTable).where(eq(iotClientsTable.isActive, true));
    }

    const [sim] = await db.insert(simulationsTable).values({
      name,
      dataset: config.dataset,
      numClients: clients.length,
      numRounds: config.numRounds,
      baseEpsilon: config.baseEpsilon,
      baseDelta: config.baseDelta,
      minTrustScore: config.minTrustScore,
      resourceThreshold: config.resourceThreshold,
      alphaWeight: config.alphaWeight,
      betaWeight: config.betaWeight,
      finalAccuracy: 0,
      finalLoss: 0,
      avgPrivacyLoss: 0,
      avgCommunicationCost: 0,
      avgEnergyConsumption: 0,
    }).returning();

    let accuracy = 0.45 + Math.random() * 0.1;
    let loss = 1.2 + Math.random() * 0.3;
    let cumulativePrivacyLoss = 0;
    let convergenceRound: number | null = null;
    const allRounds = [];
    const totalPrivacyLoss: number[] = [];
    const totalCommCosts: number[] = [];
    const totalEnergy: number[] = [];

    for (let r = 1; r <= config.numRounds; r++) {
      const { roundData, clientUpdates } = simulateRound(r, clients, config, accuracy, loss, cumulativePrivacyLoss);

      const [insertedRound] = await db.insert(flRoundsTable).values({
        simulationId: sim.id,
        ...roundData,
      }).returning();

      const updatesWithRoundId = clientUpdates.map((u) => ({ roundId: insertedRound.id, ...u }));
      await db.insert(clientUpdatesTable).values(updatesWithRoundId);

      accuracy = roundData.globalAccuracy;
      loss = roundData.globalLoss;
      cumulativePrivacyLoss = roundData.cumulativePrivacyLoss;
      totalPrivacyLoss.push(roundData.cumulativePrivacyLoss);
      totalCommCosts.push(roundData.communicationCost);
      totalEnergy.push(roundData.energyConsumed);

      if (!convergenceRound && accuracy >= 0.90) {
        convergenceRound = r;
      }

      allRounds.push({ id: insertedRound.id, simulationId: sim.id, ...roundData });
    }

    const avgPrivacyLoss = totalPrivacyLoss.reduce((a, b) => a + b, 0) / totalPrivacyLoss.length;
    const avgCommCost = totalCommCosts.reduce((a, b) => a + b, 0) / totalCommCosts.length;
    const avgEnergy = totalEnergy.reduce((a, b) => a + b, 0) / totalEnergy.length;

    await db.update(simulationsTable).set({
      finalAccuracy: accuracy,
      finalLoss: loss,
      avgPrivacyLoss,
      avgCommunicationCost: avgCommCost,
      avgEnergyConsumption: avgEnergy,
      convergenceRound,
    }).where(eq(simulationsTable.id, sim.id));

    res.json({
      id: sim.id,
      name: sim.name,
      dataset: config.dataset,
      numClients: clients.length,
      numRounds: config.numRounds,
      finalAccuracy: accuracy,
      finalLoss: loss,
      avgPrivacyLoss,
      avgCommunicationCost: avgCommCost,
      avgEnergyConsumption: avgEnergy,
      convergenceRound,
      createdAt: sim.createdAt.toISOString(),
      rounds: allRounds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Simulation failed" });
  }
});

router.get("/results", async (_req, res) => {
  try {
    const sims = await db.select().from(simulationsTable).orderBy(simulationsTable.createdAt);
    const results = await Promise.all(
      sims.map(async (sim) => {
        const rounds = await db.select().from(flRoundsTable).where(eq(flRoundsTable.simulationId, sim.id));
        return {
          id: sim.id,
          name: sim.name,
          dataset: sim.dataset,
          numClients: sim.numClients,
          numRounds: sim.numRounds,
          finalAccuracy: sim.finalAccuracy,
          finalLoss: sim.finalLoss,
          avgPrivacyLoss: sim.avgPrivacyLoss,
          avgCommunicationCost: sim.avgCommunicationCost,
          avgEnergyConsumption: sim.avgEnergyConsumption,
          convergenceRound: sim.convergenceRound,
          createdAt: sim.createdAt.toISOString(),
          rounds,
        };
      })
    );
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

async function seedClients(count: number) {
  const deviceTypes = ["sensor", "wearable", "industrial", "vehicle", "gateway"] as const;
  const clients = Array.from({ length: count }, (_, i) => ({
    name: `IoT-Device-${String(i + 1).padStart(3, "0")}`,
    deviceType: deviceTypes[i % deviceTypes.length],
    trustScore: Math.round((0.3 + Math.random() * 0.7) * 100) / 100,
    computeCapacity: Math.round((0.1 + Math.random() * 0.9) * 100) / 100,
    batteryLevel: Math.round((0.2 + Math.random() * 0.8) * 100) / 100,
    bandwidthMbps: Math.round((1 + Math.random() * 99) * 10) / 10,
    isActive: true,
  }));
  await db.insert(iotClientsTable).values(clients);
}

export default router;

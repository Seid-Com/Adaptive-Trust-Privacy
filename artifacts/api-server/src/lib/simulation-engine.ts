import { db } from "@workspace/db";
import {
  simulationsTable,
  flRoundsTable,
  clientUpdatesTable,
  iotClientsTable,
} from "@workspace/db/schema";
import { eq, count } from "drizzle-orm";

export interface SimulationConfig {
  name: string;
  dataset: string;
  numClients: number;
  numRounds: number;
  baseEpsilon: number;
  baseDelta: number;
  minTrustScore: number;
  resourceThreshold: number;
  alphaWeight: number;
  betaWeight: number;
}

type ClientRow = typeof iotClientsTable.$inferSelect;

const DEVICE_TYPES = ["sensor", "wearable", "industrial", "vehicle", "gateway"] as const;

export function computeResourceCapacity(c: {
  computeCapacity: number;
  batteryLevel: number;
  bandwidthMbps: number;
}): number {
  const bwNorm = Math.min(c.bandwidthMbps / 100, 1);
  return c.computeCapacity * 0.4 + c.batteryLevel * 0.3 + bwNorm * 0.3;
}

export function computeNoiseScale(
  trust: number,
  resource: number,
  sigMax: number,
  alpha: number,
  beta: number,
): number {
  return sigMax * Math.max(0.1, 1 - alpha * trust - beta * resource);
}

export async function seedClientsIfEmpty(n: number): Promise<ClientRow[]> {
  const existing = await db.select({ count: count() }).from(iotClientsTable);
  if (existing[0].count > 0) {
    return db.select().from(iotClientsTable).where(eq(iotClientsTable.isActive, true));
  }
  const rows = Array.from({ length: n }, (_, i) => ({
    name: `IoT-Device-${String(i + 1).padStart(3, "0")}`,
    deviceType: DEVICE_TYPES[i % DEVICE_TYPES.length],
    trustScore: Math.round((0.3 + Math.random() * 0.7) * 100) / 100,
    computeCapacity: Math.round((0.1 + Math.random() * 0.9) * 100) / 100,
    batteryLevel: Math.round((0.2 + Math.random() * 0.8) * 100) / 100,
    bandwidthMbps: Math.round((1 + Math.random() * 99) * 10) / 10,
    isActive: true,
  }));
  await db.insert(iotClientsTable).values(rows);
  return db.select().from(iotClientsTable).where(eq(iotClientsTable.isActive, true));
}

export function simulateRound(
  round: number,
  clients: ClientRow[],
  config: SimulationConfig,
  prevAccuracy: number,
  prevLoss: number,
  cumulativePrivacyLoss: number,
) {
  const sigmaMax = 2.0;
  const eligible = clients.filter(
    (c) =>
      c.trustScore >= config.minTrustScore &&
      computeResourceCapacity(c) >= config.resourceThreshold,
  );
  const selected = eligible.slice(0, Math.max(3, Math.floor(eligible.length * 0.7)));

  const clientUpdates = clients.map((client) => {
    const isSelected = selected.some((s) => s.id === client.id);
    const resource = computeResourceCapacity(client);
    const noiseScale = computeNoiseScale(
      client.trustScore,
      resource,
      sigmaMax,
      config.alphaWeight,
      config.betaWeight,
    );
    const localAccuracy = Math.min(
      0.99,
      prevAccuracy + Math.random() * 0.02 * client.trustScore - 0.005,
    );
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
  const newLoss = Math.max(
    0.05,
    prevLoss - 0.02 * (1 - convergenceFactor) - 0.003 + (Math.random() - 0.5) * 0.005,
  );

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

export async function runSimulation(config: SimulationConfig) {
  let clients = await db.select().from(iotClientsTable).where(eq(iotClientsTable.isActive, true));
  if (clients.length === 0) {
    clients = await seedClientsIfEmpty(config.numClients);
  }

  const [sim] = await db
    .insert(simulationsTable)
    .values({
      name: config.name,
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
    })
    .returning();

  let accuracy = 0.45 + Math.random() * 0.1;
  let loss = 1.2 + Math.random() * 0.3;
  let cumulativePrivacyLoss = 0;
  let convergenceRound: number | null = null;
  const allRounds: Array<{ id: number; simulationId: number; roundNumber: number; globalAccuracy: number; globalLoss: number; numSelectedClients: number; avgNoiseScale: number; avgTrustScore: number; cumulativePrivacyLoss: number; communicationCost: number; energyConsumed: number }> = [];
  const totalPrivacyLoss: number[] = [];
  const totalCommCosts: number[] = [];
  const totalEnergy: number[] = [];

  for (let r = 1; r <= config.numRounds; r++) {
    const { roundData, clientUpdates } = simulateRound(
      r,
      clients,
      config,
      accuracy,
      loss,
      cumulativePrivacyLoss,
    );

    const [insertedRound] = await db
      .insert(flRoundsTable)
      .values({ simulationId: sim.id, ...roundData })
      .returning();

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

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  await db
    .update(simulationsTable)
    .set({
      finalAccuracy: accuracy,
      finalLoss: loss,
      avgPrivacyLoss: avg(totalPrivacyLoss),
      avgCommunicationCost: avg(totalCommCosts),
      avgEnergyConsumption: avg(totalEnergy),
      convergenceRound,
    })
    .where(eq(simulationsTable.id, sim.id));

  return {
    id: sim.id,
    name: sim.name,
    dataset: config.dataset,
    numClients: clients.length,
    numRounds: config.numRounds,
    baseEpsilon: config.baseEpsilon,
    baseDelta: config.baseDelta,
    alphaWeight: config.alphaWeight,
    betaWeight: config.betaWeight,
    minTrustScore: config.minTrustScore,
    resourceThreshold: config.resourceThreshold,
    finalAccuracy: accuracy,
    finalLoss: loss,
    avgPrivacyLoss: avg(totalPrivacyLoss),
    avgCommunicationCost: avg(totalCommCosts),
    avgEnergyConsumption: avg(totalEnergy),
    convergenceRound,
    createdAt: sim.createdAt.toISOString(),
    rounds: allRounds,
  };
}

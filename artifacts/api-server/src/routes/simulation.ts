import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  simulationsTable,
  flRoundsTable,
  clientUpdatesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  runSimulation,
  seedClientsIfEmpty,
  type SimulationConfig,
} from "../lib/simulation-engine";

const router: IRouter = Router();

const DEFAULT_CONFIG: SimulationConfig = {
  name: "",
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

function autoDetectConfig(name: string | undefined): SimulationConfig {
  if (!name) return { ...DEFAULT_CONFIG, name: `Auto-Run ${new Date().toISOString()}`, numRounds: 50 };
  if (name.includes("Edge-IIoTset")) {
    return { ...DEFAULT_CONFIG, name, dataset: "Edge-IIoTset", numRounds: 50, alphaWeight: 0.5, betaWeight: 0.3, baseEpsilon: 1.0 };
  }
  if (name.includes("Bot-IoT")) {
    return { ...DEFAULT_CONFIG, name, dataset: "Bot-IoT", numRounds: 50, alphaWeight: 0.6, betaWeight: 0.3, baseEpsilon: 0.5, minTrustScore: 0.4 };
  }
  if (name.includes("TON-IoT")) {
    return { ...DEFAULT_CONFIG, name, dataset: "TON-IoT", numRounds: 50 };
  }
  return { ...currentConfig, name, numRounds: 50 };
}

router.post("/run", async (req, res) => {
  try {
    const body = req.body ?? {};
    const name: string = body.name ?? `Auto-Run ${new Date().toISOString()}`;
    const config = autoDetectConfig(name);

    await seedClientsIfEmpty(config.numClients);
    const result = await runSimulation(config);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Simulation failed" });
  }
});

router.get("/results", async (_req, res) => {
  try {
    const sims = await db
      .select({
        id: simulationsTable.id,
        name: simulationsTable.name,
        dataset: simulationsTable.dataset,
        numClients: simulationsTable.numClients,
        numRounds: simulationsTable.numRounds,
        baseEpsilon: simulationsTable.baseEpsilon,
        baseDelta: simulationsTable.baseDelta,
        alphaWeight: simulationsTable.alphaWeight,
        betaWeight: simulationsTable.betaWeight,
        minTrustScore: simulationsTable.minTrustScore,
        resourceThreshold: simulationsTable.resourceThreshold,
        finalAccuracy: simulationsTable.finalAccuracy,
        finalLoss: simulationsTable.finalLoss,
        avgPrivacyLoss: simulationsTable.avgPrivacyLoss,
        avgCommunicationCost: simulationsTable.avgCommunicationCost,
        avgEnergyConsumption: simulationsTable.avgEnergyConsumption,
        convergenceRound: simulationsTable.convergenceRound,
        createdAt: simulationsTable.createdAt,
        roundId: flRoundsTable.id,
        roundNumber: flRoundsTable.roundNumber,
        globalAccuracy: flRoundsTable.globalAccuracy,
        globalLoss: flRoundsTable.globalLoss,
        numSelectedClients: flRoundsTable.numSelectedClients,
        avgNoiseScale: flRoundsTable.avgNoiseScale,
        avgTrustScore: flRoundsTable.avgTrustScore,
        cumulativePrivacyLoss: flRoundsTable.cumulativePrivacyLoss,
        communicationCost: flRoundsTable.communicationCost,
        energyConsumed: flRoundsTable.energyConsumed,
      })
      .from(simulationsTable)
      .leftJoin(flRoundsTable, eq(simulationsTable.id, flRoundsTable.simulationId))
      .orderBy(simulationsTable.createdAt, flRoundsTable.roundNumber);

    const simMap = new Map<number, ReturnType<typeof buildSim>>();
    for (const row of sims) {
      if (!simMap.has(row.id)) {
        simMap.set(row.id, buildSim(row));
      }
      const sim = simMap.get(row.id)!;
      if (row.roundId) {
        sim.rounds.push({
          id: row.roundId,
          simulationId: row.id,
          roundNumber: row.roundNumber,
          globalAccuracy: row.globalAccuracy,
          globalLoss: row.globalLoss,
          numSelectedClients: row.numSelectedClients,
          avgNoiseScale: row.avgNoiseScale,
          avgTrustScore: row.avgTrustScore,
          cumulativePrivacyLoss: row.cumulativePrivacyLoss,
          communicationCost: row.communicationCost,
          energyConsumed: row.energyConsumed,
        });
      }
    }

    res.json(Array.from(simMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

function buildSim(row: {
  id: number; name: string; dataset: string; numClients: number; numRounds: number;
  baseEpsilon: number; baseDelta: number; alphaWeight: number; betaWeight: number;
  minTrustScore: number; resourceThreshold: number;
  finalAccuracy: number; finalLoss: number; avgPrivacyLoss: number;
  avgCommunicationCost: number; avgEnergyConsumption: number;
  convergenceRound: number | null; createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    dataset: row.dataset,
    numClients: row.numClients,
    numRounds: row.numRounds,
    baseEpsilon: row.baseEpsilon,
    baseDelta: row.baseDelta,
    alphaWeight: row.alphaWeight,
    betaWeight: row.betaWeight,
    minTrustScore: row.minTrustScore,
    resourceThreshold: row.resourceThreshold,
    finalAccuracy: row.finalAccuracy,
    finalLoss: row.finalLoss,
    avgPrivacyLoss: row.avgPrivacyLoss,
    avgCommunicationCost: row.avgCommunicationCost,
    avgEnergyConsumption: row.avgEnergyConsumption,
    convergenceRound: row.convergenceRound,
    createdAt: row.createdAt.toISOString(),
    rounds: [] as Array<{
      id: number; simulationId: number; roundNumber: number;
      globalAccuracy: number; globalLoss: number; numSelectedClients: number;
      avgNoiseScale: number; avgTrustScore: number; cumulativePrivacyLoss: number;
      communicationCost: number; energyConsumed: number;
    }>,
  };
}

export default router;

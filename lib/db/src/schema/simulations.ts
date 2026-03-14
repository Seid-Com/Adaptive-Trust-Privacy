import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const simulationsTable = pgTable("simulations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  dataset: text("dataset").notNull().default("TON-IoT"),
  numClients: integer("num_clients").notNull().default(20),
  numRounds: integer("num_rounds").notNull().default(50),
  baseEpsilon: real("base_epsilon").notNull().default(1.0),
  baseDelta: real("base_delta").notNull().default(1e-5),
  minTrustScore: real("min_trust_score").notNull().default(0.3),
  resourceThreshold: real("resource_threshold").notNull().default(0.2),
  alphaWeight: real("alpha_weight").notNull().default(0.5),
  betaWeight: real("beta_weight").notNull().default(0.3),
  finalAccuracy: real("final_accuracy").notNull().default(0),
  finalLoss: real("final_loss").notNull().default(0),
  avgPrivacyLoss: real("avg_privacy_loss").notNull().default(0),
  avgCommunicationCost: real("avg_communication_cost").notNull().default(0),
  avgEnergyConsumption: real("avg_energy_consumption").notNull().default(0),
  convergenceRound: integer("convergence_round"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSimulationSchema = createInsertSchema(simulationsTable).omit({ id: true, createdAt: true });
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
export type Simulation = typeof simulationsTable.$inferSelect;

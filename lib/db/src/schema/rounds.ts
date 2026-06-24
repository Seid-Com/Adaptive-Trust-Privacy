import { pgTable, serial, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { simulationsTable } from "./simulations";

export const flRoundsTable = pgTable("fl_rounds", {
  id: serial("id").primaryKey(),
  simulationId: integer("simulation_id").notNull().references(() => simulationsTable.id),
  roundNumber: integer("round_number").notNull(),
  globalAccuracy: real("global_accuracy").notNull(),
  globalLoss: real("global_loss").notNull(),
  numSelectedClients: integer("num_selected_clients").notNull(),
  avgNoiseScale: real("avg_noise_scale").notNull(),
  avgTrustScore: real("avg_trust_score").notNull(),
  cumulativePrivacyLoss: real("cumulative_privacy_loss").notNull(),
  communicationCost: real("communication_cost").notNull(),
  energyConsumed: real("energy_consumed").notNull(),
});

export const insertFLRoundSchema = createInsertSchema(flRoundsTable).omit({ id: true });
export type InsertFLRound = z.infer<typeof insertFLRoundSchema>;
export type FLRound = typeof flRoundsTable.$inferSelect;

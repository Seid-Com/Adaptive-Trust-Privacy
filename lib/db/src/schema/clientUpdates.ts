import { pgTable, serial, integer, real, boolean, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { flRoundsTable } from "./rounds";
import { iotClientsTable } from "./clients";

export const clientUpdatesTable = pgTable("client_updates", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => flRoundsTable.id),
  clientId: integer("client_id").notNull().references(() => iotClientsTable.id),
  clientName: text("client_name").notNull(),
  deviceType: text("device_type").notNull(),
  trustScore: real("trust_score").notNull(),
  resourceCapacity: real("resource_capacity").notNull(),
  noiseScale: real("noise_scale").notNull(),
  localAccuracy: real("local_accuracy").notNull(),
  privacyBudgetUsed: real("privacy_budget_used").notNull(),
  communicationBytes: integer("communication_bytes").notNull(),
  energyUsed: real("energy_used").notNull(),
  selected: boolean("selected").notNull().default(true),
});

export const insertClientUpdateSchema = createInsertSchema(clientUpdatesTable).omit({ id: true });
export type InsertClientUpdate = z.infer<typeof insertClientUpdateSchema>;
export type ClientUpdate = typeof clientUpdatesTable.$inferSelect;

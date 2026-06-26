import { pgTable, serial, text, real, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const iotClientsTable = pgTable("iot_clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  deviceType: text("device_type").notNull(),
  trustScore: real("trust_score").notNull(),
  computeCapacity: real("compute_capacity").notNull(),
  batteryLevel: real("battery_level").notNull(),
  bandwidthMbps: real("bandwidth_mbps").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_iot_clients_device_type").on(t.deviceType),
  index("idx_iot_clients_is_active").on(t.isActive),
]);

export const insertIoTClientSchema = createInsertSchema(iotClientsTable).omit({ id: true, createdAt: true });
export type InsertIoTClient = z.infer<typeof insertIoTClientSchema>;
export type IoTClient = typeof iotClientsTable.$inferSelect;

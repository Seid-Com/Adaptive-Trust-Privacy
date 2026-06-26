import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { iotClientsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  try {
    const clients = await db.select().from(iotClientsTable).orderBy(iotClientsTable.id);
    res.json(clients.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, deviceType, trustScore, computeCapacity, batteryLevel, bandwidthMbps } = req.body;
    if (!name || !deviceType || trustScore == null || computeCapacity == null || batteryLevel == null || bandwidthMbps == null) {
      res.status(400).json({ error: "Missing required fields: name, deviceType, trustScore, computeCapacity, batteryLevel, bandwidthMbps" });
      return;
    }
    const validTypes = ["sensor", "wearable", "industrial", "vehicle", "gateway"];
    if (!validTypes.includes(deviceType)) {
      res.status(400).json({ error: `Invalid deviceType. Must be one of: ${validTypes.join(", ")}` });
      return;
    }
    const [client] = await db
      .insert(iotClientsTable)
      .values({
        name,
        deviceType,
        trustScore: Number(trustScore),
        computeCapacity: Number(computeCapacity),
        batteryLevel: Number(batteryLevel),
        bandwidthMbps: Number(bandwidthMbps),
        isActive: true,
      })
      .returning();
    res.status(201).json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create client" });
  }
});

router.get("/:clientId", async (req, res) => {
  try {
    const id = Number(req.params.clientId);
    if (Number.isNaN(id) || id <= 0) {
      res.status(400).json({ error: "Invalid client ID" });
      return;
    }
    const [client] = await db.select().from(iotClientsTable).where(eq(iotClientsTable.id, id));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch client" });
  }
});

export default router;

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
    const [client] = await db.insert(iotClientsTable).values({
      name,
      deviceType,
      trustScore,
      computeCapacity,
      batteryLevel,
      bandwidthMbps,
      isActive: true,
    }).returning();
    res.status(201).json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create client" });
  }
});

router.get("/:clientId", async (req, res) => {
  try {
    const id = parseInt(req.params.clientId);
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

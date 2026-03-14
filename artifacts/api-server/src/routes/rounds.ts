import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { flRoundsTable, clientUpdatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const simId = req.query.simulationId ? parseInt(req.query.simulationId as string) : undefined;
    const rounds = simId
      ? await db.select().from(flRoundsTable).where(eq(flRoundsTable.simulationId, simId))
      : await db.select().from(flRoundsTable);
    res.json(rounds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch rounds" });
  }
});

router.get("/:roundId/client-updates", async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const updates = await db.select().from(clientUpdatesTable).where(eq(clientUpdatesTable.roundId, roundId));
    res.json(updates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch client updates" });
  }
});

export default router;

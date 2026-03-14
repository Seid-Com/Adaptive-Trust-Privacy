import { Router, type IRouter } from "express";
import healthRouter from "./health";
import simulationRouter from "./simulation";
import clientsRouter from "./clients";
import roundsRouter from "./rounds";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/simulation", simulationRouter);
router.use("/clients", clientsRouter);
router.use("/rounds", roundsRouter);

export default router;

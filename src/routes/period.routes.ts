import { Router } from "express";
import {
  createPeriodHandler,
  deletePeriodHandler,
  getPeriodHandler,
  listPeriodsHandler,
} from "../controllers/period.controller.js";

const router = Router();

router.post("/periods", createPeriodHandler);
router.get("/periods", listPeriodsHandler);
router.get("/periods/:id", getPeriodHandler);
router.delete("/periods/:id", deletePeriodHandler);

export default router;

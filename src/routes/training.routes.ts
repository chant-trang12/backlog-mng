import { Router } from "express";
import {
  createTrainingRecordHandler,
  deleteTrainingRecordHandler,
  listTrainingRecordsHandler,
  updateTrainingRecordHandler,
} from "../controllers/training.controller.js";

const router = Router();

router.post("/training-records", createTrainingRecordHandler);
router.get("/training-records", listTrainingRecordsHandler);
router.put("/training-records/:id", updateTrainingRecordHandler);
router.delete("/training-records/:id", deleteTrainingRecordHandler);

export default router;

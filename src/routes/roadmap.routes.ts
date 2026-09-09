import { Router } from "express";
import {
  createRoadmapItemHandler,
  deleteRoadmapItemHandler,
  listRoadmapItemsHandler,
  updateRoadmapItemHandler,
} from "../controllers/roadmap.controller.js";

const router = Router();

router.get("/roadmap-items", listRoadmapItemsHandler);
router.post("/roadmap-items", createRoadmapItemHandler);
router.put("/roadmap-items/:id", updateRoadmapItemHandler);
router.delete("/roadmap-items/:id", deleteRoadmapItemHandler);

export default router;

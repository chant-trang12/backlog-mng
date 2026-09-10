import { Router } from "express";
import {
  createRoadmapDetailHandler,
  createRoadmapItemHandler,
  deleteRoadmapDetailHandler,
  deleteRoadmapItemHandler,
  listRoadmapDetailsHandler,
  listRoadmapItemsHandler,
  updateRoadmapDetailHandler,
  updateRoadmapItemHandler,
} from "../controllers/roadmap.controller.js";

const router = Router();

router.get("/roadmap-items", listRoadmapItemsHandler);
router.post("/roadmap-items", createRoadmapItemHandler);
router.put("/roadmap-items/:id", updateRoadmapItemHandler);
router.delete("/roadmap-items/:id", deleteRoadmapItemHandler);

router.get("/roadmap-items/:id/details", listRoadmapDetailsHandler);
router.post("/roadmap-items/:id/details", createRoadmapDetailHandler);
router.put("/roadmap-details/:detailId", updateRoadmapDetailHandler);
router.delete("/roadmap-details/:detailId", deleteRoadmapDetailHandler);

export default router;

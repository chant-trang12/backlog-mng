import { Router } from "express";
import {
  approveFeatureRequestHandler,
  createFeatureRequestHandler,
  deleteFeatureRequestHandler,
  getFeatureRequestHandler,
  linkFeatureRequestToBacklogHandler,
  linkFeatureRequestToRoadmapHandler,
  listFeatureRequestsHandler,
  listLoaiYeuCauHandler,
  rejectFeatureRequestHandler,
  updateFeatureRequestHandler,
} from "../controllers/featureRequest.controller.js";

const router = Router();

router.get("/loai-yeu-cau", listLoaiYeuCauHandler);
router.get("/feature-requests", listFeatureRequestsHandler);
router.post("/feature-requests", createFeatureRequestHandler);
router.get("/feature-requests/:id", getFeatureRequestHandler);
router.put("/feature-requests/:id", updateFeatureRequestHandler);
router.delete("/feature-requests/:id", deleteFeatureRequestHandler);
// Đặt trước "/:id" chung không xung đột vì Express match theo path đầy đủ.
router.post("/feature-requests/:id/approve", approveFeatureRequestHandler);
router.post("/feature-requests/:id/reject", rejectFeatureRequestHandler);
router.post("/feature-requests/:id/to-backlog", linkFeatureRequestToBacklogHandler);
router.post("/feature-requests/:id/to-roadmap", linkFeatureRequestToRoadmapHandler);

export default router;

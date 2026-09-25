import express, { Router } from "express";
import {
  approveFeatureRequestHandler,
  createFeatureRequestHandler,
  deleteFeatureRequestAttachmentHandler,
  deleteFeatureRequestHandler,
  downloadFeatureRequestAttachmentHandler,
  getFeatureRequestHandler,
  linkFeatureRequestToBacklogHandler,
  linkFeatureRequestToRoadmapHandler,
  listFeatureRequestsHandler,
  listLoaiYeuCauHandler,
  rejectFeatureRequestHandler,
  updateFeatureRequestHandler,
  uploadFeatureRequestAttachmentHandler,
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
// Body là bytes thô của file đính kèm (client gửi File object trực tiếp,
// không qua multipart form) — express.raw() riêng cho route này, giống mọi
// route upload file khác trong hệ thống (không ảnh hưởng express.json()
// dùng chung cho các route khác).
router.post(
  "/feature-requests/:id/attachment",
  express.raw({ type: () => true, limit: "10mb" }),
  uploadFeatureRequestAttachmentHandler,
);
router.get("/feature-requests/:id/attachment", downloadFeatureRequestAttachmentHandler);
router.delete("/feature-requests/:id/attachment", deleteFeatureRequestAttachmentHandler);

export default router;

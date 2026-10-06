import express, { Router } from "express";
import {
  approveFeatureRequestHandler,
  createFeatureRequestHandler,
  deleteFeatureRequestAttachmentHandler,
  deleteFeatureRequestHandler,
  deleteSelectedFeatureRequestsHandler,
  downloadFeatureRequestAttachmentHandler,
  downloadFeatureRequestTemplateHandler,
  getFeatureRequestHandler,
  importFeatureRequestsHandler,
  linkFeatureRequestToBacklogHandler,
  linkFeatureRequestToRoadmapHandler,
  listFeatureRequestsHandler,
  listLoaiYeuCauHandler,
  rejectFeatureRequestHandler,
  transferFeatureRequestHandler,
  updateFeatureRequestHandler,
  uploadFeatureRequestAttachmentHandler,
} from "../controllers/featureRequest.controller.js";

const router = Router();

router.get("/loai-yeu-cau", listLoaiYeuCauHandler);
router.get("/feature-requests", listFeatureRequestsHandler);
router.post("/feature-requests", createFeatureRequestHandler);
// Import Excel biểu mẫu Quy trình số hóa — ĐẶT TRƯỚC "/feature-requests/:id"
// để không bị route ":id" bắt hết (GET "/import-template" trùng pattern
// "/:id"). Template tải file .xlsx mẫu; POST import body là bytes thô
// .xlsx (express.raw() riêng, giống mọi route upload/import khác).
router.get("/feature-requests/import-template", downloadFeatureRequestTemplateHandler);
router.post(
  "/feature-requests/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importFeatureRequestsHandler,
);
// Đặt trước "/:id" — path riêng "delete-selected" không khớp ":id" nên
// không xung đột, nhưng đặt trước cho dễ đọc (đi cùng nhóm route chung,
// không phải route theo id). Chỉ admin gọi tới được — xem requireAdmin
// scope theo tiền tố "/api/feature-requests/delete-selected" ở app.ts.
router.post("/feature-requests/delete-selected", deleteSelectedFeatureRequestsHandler);
router.get("/feature-requests/:id", getFeatureRequestHandler);
router.put("/feature-requests/:id", updateFeatureRequestHandler);
router.delete("/feature-requests/:id", deleteFeatureRequestHandler);
// Đặt trước "/:id" chung không xung đột vì Express match theo path đầy đủ.
router.post("/feature-requests/:id/approve", approveFeatureRequestHandler);
router.post("/feature-requests/:id/reject", rejectFeatureRequestHandler);
// Chuyển đơn vị thực hiện — đổi phòng đích (cả 2 phía, còn "Chờ duyệt").
router.post("/feature-requests/:id/transfer", transferFeatureRequestHandler);
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

import express, { Router } from "express";
import {
  createDigitalFeatureHandler,
  deleteDigitalFeatureHandler,
  deleteSelectedDigitalFeaturesHandler,
  downloadDigitalFeatureTemplateHandler,
  exportDigitalFeaturesHandler,
  getDigitalFeatureHandler,
  importDigitalFeaturesHandler,
  listDigitalFeaturesHandler,
  updateDigitalFeatureHandler,
} from "../controllers/digitalFeature.controller.js";
import {
  createDigitalFeatureScreenHandler,
  deleteDigitalFeatureScreenHandler,
  deleteSelectedDigitalFeatureScreensHandler,
  downloadDigitalFeatureScreenTemplateHandler,
  exportDigitalFeatureScreensHandler,
  getDigitalFeatureScreenHandler,
  importDigitalFeatureScreensHandler,
  listDigitalFeatureScreensHandler,
  updateDigitalFeatureScreenHandler,
} from "../controllers/digitalFeatureScreen.controller.js";
import {
  createDigitalFeatureMasterDataHandler,
  deleteDigitalFeatureMasterDataHandler,
  deleteSelectedDigitalFeatureMasterDataHandler,
  downloadDigitalFeatureMdTemplateHandler,
  exportDigitalFeatureMasterDataHandler,
  getDigitalFeatureMasterDataHandler,
  importDigitalFeatureMasterDataHandler,
  listDigitalFeatureMasterDataHandler,
  updateDigitalFeatureMasterDataHandler,
} from "../controllers/digitalFeatureMasterData.controller.js";
import {
  createDigitalFeatureDataObjectHandler,
  deleteDigitalFeatureDataObjectHandler,
  deleteSelectedDigitalFeatureDataObjectsHandler,
  downloadDigitalFeatureDoTemplateHandler,
  exportDigitalFeatureDataObjectsHandler,
  getDigitalFeatureDataObjectHandler,
  importDigitalFeatureDataObjectsHandler,
  listDigitalFeatureDataObjectsHandler,
  updateDigitalFeatureDataObjectHandler,
} from "../controllers/digitalFeatureDataObject.controller.js";
import {
  createDigitalFeatureIntegrationHandler,
  deleteDigitalFeatureIntegrationHandler,
  deleteSelectedDigitalFeatureIntegrationsHandler,
  downloadDigitalFeatureIntTemplateHandler,
  exportDigitalFeatureIntegrationsHandler,
  getDigitalFeatureIntegrationHandler,
  importDigitalFeatureIntegrationsHandler,
  listDigitalFeatureIntegrationsHandler,
  updateDigitalFeatureIntegrationHandler,
} from "../controllers/digitalFeatureIntegration.controller.js";

const router = Router();

router.get("/digital-features", listDigitalFeaturesHandler);
router.post("/digital-features", createDigitalFeatureHandler);
// Xóa nhiều đã chọn (checkbox bảng) — đặt trước "/:id" như các route đặc
// biệt khác; quyền admin chặn ở app.ts theo tiền tố path này.
router.post("/digital-features/delete-selected", deleteSelectedDigitalFeaturesHandler);
// ĐẶT TRƯỚC "/digital-features/:id" để không bị route ":id" bắt hết (GET
// "/import-template"/"/export" trùng pattern "/:id"). Template tải file
// .xlsx mẫu; POST import body là bytes thô .xlsx (express.raw() riêng,
// giống mọi route upload/import khác).
router.get("/digital-features/import-template", downloadDigitalFeatureTemplateHandler);
router.post(
  "/digital-features/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importDigitalFeaturesHandler,
);
router.get("/digital-features/export", exportDigitalFeaturesHandler);

// ===== Màn hình, Tính năng & Phân quyền (tab 2 trong chi tiết tính năng) =====
// Các route "/digital-features/:id/screens" có 3 đoạn path nên không bị
// route "/digital-features/:id" (2 đoạn) bắt — vẫn nhóm vào đây cho gọn.
// Xóa nhiều (checkbox bảng) — admin chặn ở app.ts theo tiền tố path.
router.post("/digital-features/:id/screens/delete-selected", deleteSelectedDigitalFeatureScreensHandler);
// File mẫu .xlsx + import (body bytes thô express.raw) + export — đặt trước
// "/:id" để không bị ":id" nuốt path "import-template"/"export".
router.get("/digital-features/:id/screens/import-template", downloadDigitalFeatureScreenTemplateHandler);
router.post(
  "/digital-features/:id/screens/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importDigitalFeatureScreensHandler,
);
router.get("/digital-features/:id/screens/export", exportDigitalFeatureScreensHandler);
router.get("/digital-features/:id/screens", listDigitalFeatureScreensHandler);
router.post("/digital-features/:id/screens", createDigitalFeatureScreenHandler);

// Route phẳng cho từng màn hình (sửa/xóa/xem 1 dòng).
router.get("/digital-feature-screens/:id", getDigitalFeatureScreenHandler);
router.put("/digital-feature-screens/:id", updateDigitalFeatureScreenHandler);
router.delete("/digital-feature-screens/:id", deleteDigitalFeatureScreenHandler);

// ===== Danh mục (Master Data) của Module (tab 3 trong chi tiết tính năng)
// — cùng cấu trúc route với tab Màn hình ở trên. =====
// Xóa nhiều (checkbox bảng) — admin chặn ở app.ts theo tiền tố path.
router.post("/digital-features/:id/master-data/delete-selected", deleteSelectedDigitalFeatureMasterDataHandler);
router.get("/digital-features/:id/master-data/import-template", downloadDigitalFeatureMdTemplateHandler);
router.post(
  "/digital-features/:id/master-data/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importDigitalFeatureMasterDataHandler,
);
router.get("/digital-features/:id/master-data/export", exportDigitalFeatureMasterDataHandler);
router.get("/digital-features/:id/master-data", listDigitalFeatureMasterDataHandler);
router.post("/digital-features/:id/master-data", createDigitalFeatureMasterDataHandler);

// Route phẳng cho từng danh mục (sửa/xóa/xem 1 dòng).
router.get("/digital-feature-master-data/:id", getDigitalFeatureMasterDataHandler);
router.put("/digital-feature-master-data/:id", updateDigitalFeatureMasterDataHandler);
router.delete("/digital-feature-master-data/:id", deleteDigitalFeatureMasterDataHandler);

// ===== Đối tượng dữ liệu & Vòng đời trạng thái (tab 4 trong chi tiết tính
// năng) — cùng cấu trúc route với tab Danh mục ở trên. =====
// Xóa nhiều (checkbox bảng) — admin chặn ở app.ts theo tiền tố path.
router.post("/digital-features/:id/data-objects/delete-selected", deleteSelectedDigitalFeatureDataObjectsHandler);
router.get("/digital-features/:id/data-objects/import-template", downloadDigitalFeatureDoTemplateHandler);
router.post(
  "/digital-features/:id/data-objects/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importDigitalFeatureDataObjectsHandler,
);
router.get("/digital-features/:id/data-objects/export", exportDigitalFeatureDataObjectsHandler);
router.get("/digital-features/:id/data-objects", listDigitalFeatureDataObjectsHandler);
router.post("/digital-features/:id/data-objects", createDigitalFeatureDataObjectHandler);

// Route phẳng cho từng đối tượng (sửa/xóa/xem 1 dòng).
router.get("/digital-feature-data-objects/:id", getDigitalFeatureDataObjectHandler);
router.put("/digital-feature-data-objects/:id", updateDigitalFeatureDataObjectHandler);
router.delete("/digital-feature-data-objects/:id", deleteDigitalFeatureDataObjectHandler);

// ===== Tích hợp & Sự kiện (tab 5 trong chi tiết tính năng) — cùng cấu
// trúc route với tab Đối tượng dữ liệu ở trên. =====
// Xóa nhiều (checkbox bảng) — admin chặn ở app.ts theo tiền tố path.
router.post("/digital-features/:id/integrations/delete-selected", deleteSelectedDigitalFeatureIntegrationsHandler);
router.get("/digital-features/:id/integrations/import-template", downloadDigitalFeatureIntTemplateHandler);
router.post(
  "/digital-features/:id/integrations/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importDigitalFeatureIntegrationsHandler,
);
router.get("/digital-features/:id/integrations/export", exportDigitalFeatureIntegrationsHandler);
router.get("/digital-features/:id/integrations", listDigitalFeatureIntegrationsHandler);
router.post("/digital-features/:id/integrations", createDigitalFeatureIntegrationHandler);

// Route phẳng cho từng luồng tích hợp (sửa/xóa/xem 1 dòng).
router.get("/digital-feature-integrations/:id", getDigitalFeatureIntegrationHandler);
router.put("/digital-feature-integrations/:id", updateDigitalFeatureIntegrationHandler);
router.delete("/digital-feature-integrations/:id", deleteDigitalFeatureIntegrationHandler);

router.get("/digital-features/:id", getDigitalFeatureHandler);
router.put("/digital-features/:id", updateDigitalFeatureHandler);
router.delete("/digital-features/:id", deleteDigitalFeatureHandler);

export default router;

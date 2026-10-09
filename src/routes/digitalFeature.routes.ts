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

router.get("/digital-features/:id", getDigitalFeatureHandler);
router.put("/digital-features/:id", updateDigitalFeatureHandler);
router.delete("/digital-features/:id", deleteDigitalFeatureHandler);

export default router;

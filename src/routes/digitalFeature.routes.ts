import express, { Router } from "express";
import {
  createDigitalFeatureHandler,
  deleteDigitalFeatureHandler,
  downloadDigitalFeatureTemplateHandler,
  exportDigitalFeaturesHandler,
  getDigitalFeatureHandler,
  importDigitalFeaturesHandler,
  listDigitalFeaturesHandler,
  updateDigitalFeatureHandler,
} from "../controllers/digitalFeature.controller.js";

const router = Router();

router.get("/digital-features", listDigitalFeaturesHandler);
router.post("/digital-features", createDigitalFeatureHandler);
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
router.get("/digital-features/:id", getDigitalFeatureHandler);
router.put("/digital-features/:id", updateDigitalFeatureHandler);
router.delete("/digital-features/:id", deleteDigitalFeatureHandler);

export default router;

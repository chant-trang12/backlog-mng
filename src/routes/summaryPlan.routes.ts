import express, { Router } from "express";
import {
  deleteCbnvXepLoaiHandler,
  downloadCbnvXepLoaiTemplateHandler,
  exportCbnvXepLoaiHandler,
  fetchKiHandler,
  importCbnvXepLoaiHandler,
  listCbnvXepLoaiHandler,
  updateCbnvXepLoaiHandler,
} from "../controllers/summaryPlan.controller.js";

const router = Router();

router.get("/cbnv-xep-loai", listCbnvXepLoaiHandler);
router.get("/cbnv-xep-loai/import-template", downloadCbnvXepLoaiTemplateHandler);
router.post(
  "/cbnv-xep-loai/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importCbnvXepLoaiHandler,
);
// Xuất Excel — GET (không phải POST), giống feature-requests/export: đây là
// thao tác ĐỌC, không nên bị requireWrite đòi quyền can_add.
router.get("/cbnv-xep-loai/export", exportCbnvXepLoaiHandler);
router.post("/cbnv-xep-loai/fetch-ki", fetchKiHandler);
router.put("/cbnv-xep-loai/:id", updateCbnvXepLoaiHandler);
router.delete("/cbnv-xep-loai/:id", deleteCbnvXepLoaiHandler);

export default router;

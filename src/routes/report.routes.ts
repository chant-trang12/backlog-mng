import express, { Router } from "express";
import * as c from "../controllers/report.controller.js";

const router = Router();

// Mẫu PowerPoint
router.get("/report-templates", c.listTemplatesHandler);
router.get("/report-templates/:type", c.getTemplateHandler);
router.get("/report-templates/:type/file", c.downloadTemplateHandler);
router.get("/report-templates/:type/sample", c.sampleTemplateHandler);
router.post("/report-templates/:type/upload", express.raw({ type: () => true, limit: "40mb" }), c.uploadTemplateHandler);
router.put("/report-templates/:type/fields", c.updateFieldsHandler);

// Báo cáo
router.get("/reports/overview", c.overviewHandler);
router.post("/reports", c.createReportHandler);
router.get("/reports/:id", c.getReportHandler);
router.delete("/reports/:id", c.deleteReportHandler);
router.put("/reports/:id/sections/:code", c.updateSectionHandler);
router.post("/reports/:id/sections/:code/pull-previous", c.pullPreviousHandler);
router.post("/reports/:id/copy-previous", c.copyPreviousHandler);
router.post("/reports/:id/refresh", c.refreshHandler);
router.post("/reports/:id/export", c.exportReportHandler);
router.get("/reports/:id/versions", c.listVersionsHandler);
router.get("/report-versions/:vid/download", c.downloadVersionHandler);

export default router;

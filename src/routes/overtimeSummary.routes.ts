import express, { Router } from "express";
import * as c from "../controllers/overtimeSummary.controller.js";

const router = Router();

router.get("/overtime-summary", c.listSummaryHandler);
router.get("/overtime-summary/import-template", c.summaryTemplateHandler);
router.get("/overtime-summary/export", c.exportSummaryHandler);
router.post("/overtime-summary/import", express.raw({ type: () => true, limit: "20mb" }), c.importSummaryHandler);
router.post("/overtime-summary/from-detail", c.fromDetailHandler);
router.post("/overtime-summary", c.createSummaryHandler);
router.put("/overtime-summary/:id", c.updateSummaryHandler);
router.delete("/overtime-summary/:id", c.deleteSummaryHandler);

export default router;

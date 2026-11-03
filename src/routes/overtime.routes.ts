import express, { Router } from "express";
import {
  createOvertimeHandler,
  deleteOvertimeHandler,
  exportOvertimeHandler,
  importOvertimeHandler,
  listOvertimeHandler,
  overtimeTemplateHandler,
  updateOvertimeHandler,
} from "../controllers/overtime.controller.js";

const router = Router();

router.get("/overtime", listOvertimeHandler);
router.get("/overtime/import-template", overtimeTemplateHandler);
router.get("/overtime/export", exportOvertimeHandler);
router.post("/overtime/import", express.raw({ type: () => true, limit: "20mb" }), importOvertimeHandler);
router.post("/overtime", createOvertimeHandler);
router.put("/overtime/:id", updateOvertimeHandler);
router.delete("/overtime/:id", deleteOvertimeHandler);

export default router;

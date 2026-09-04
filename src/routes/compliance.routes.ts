import { Router } from "express";
import {
  createComplianceRecordHandler,
  deleteComplianceRecordHandler,
  listComplianceRecordsHandler,
  updateComplianceRecordHandler,
} from "../controllers/compliance.controller.js";

const router = Router();

router.post("/compliance-records", createComplianceRecordHandler);
router.get("/compliance-records", listComplianceRecordsHandler);
router.put("/compliance-records/:id", updateComplianceRecordHandler);
router.delete("/compliance-records/:id", deleteComplianceRecordHandler);

export default router;

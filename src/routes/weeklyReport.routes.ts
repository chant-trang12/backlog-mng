import { Router } from "express";
import {
  copyPreviousHandler,
  createRowHandler,
  deleteRowHandler,
  exportWeeklyHandler,
  getWeeklyHandler,
  moveRowHandler,
  setCompanyHandler,
  updateRowHandler,
} from "../controllers/weeklyReport.controller.js";

const router = Router();

router.get("/weekly-reports", getWeeklyHandler);
router.get("/weekly-reports/export", exportWeeklyHandler);
router.post("/weekly-reports/rows", createRowHandler);
router.put("/weekly-reports/rows/:id", updateRowHandler);
router.delete("/weekly-reports/rows/:id", deleteRowHandler);
router.post("/weekly-reports/rows/:id/move", moveRowHandler);
router.put("/weekly-reports/company", setCompanyHandler);
router.post("/weekly-reports/copy-previous", copyPreviousHandler);

export default router;

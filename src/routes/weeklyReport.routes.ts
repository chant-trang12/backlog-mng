import { Router } from "express";
import {
  addShareHandler,
  copyPreviousHandler,
  createRowHandler,
  deleteRowHandler,
  exportWeeklyHandler,
  getWeeklyHandler,
  listSharesHandler,
  moveRowHandler,
  removeShareHandler,
  setCompanyHandler,
  sharedUnseenHandler,
  sharedWithMeHandler,
  updateRowHandler,
  viewSharedHandler,
  exportSharedHandler,
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
// Chia sẻ BC tuần cho người / phòng ban khác (người nhận chỉ xem + xuất PDF).
router.get("/weekly-reports/shared-with-me", sharedWithMeHandler);
router.get("/weekly-reports/shared-unseen-count", sharedUnseenHandler);
router.get("/weekly-reports/shared/:id", viewSharedHandler);
router.get("/weekly-reports/shared/:id/export", exportSharedHandler);
router.get("/weekly-reports/shares", listSharesHandler);
router.post("/weekly-reports/shares", addShareHandler);
router.delete("/weekly-reports/shares/:sid", removeShareHandler);

export default router;

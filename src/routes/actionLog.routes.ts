import { Router } from "express";
import { listActionLogModulesHandler, listActionLogsHandler } from "../controllers/actionLog.controller.js";

const router = Router();

router.get("/action-logs/modules", listActionLogModulesHandler);
router.get("/action-logs", listActionLogsHandler);

export default router;

import { Router } from "express";
import {
  createSupportRecordHandler,
  deleteSupportRecordHandler,
  listSupportRecordsHandler,
  updateSupportRecordHandler,
} from "../controllers/support.controller.js";

const router = Router();

router.post("/support-records", createSupportRecordHandler);
router.get("/support-records", listSupportRecordsHandler);
router.put("/support-records/:id", updateSupportRecordHandler);
router.delete("/support-records/:id", deleteSupportRecordHandler);

export default router;

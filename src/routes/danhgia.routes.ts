import { Router } from "express";
import {
  bulkUpsertDanhGiaRecordsHandler,
  deleteDanhGiaRecordHandler,
  listDanhGiaRecordsHandler,
  updateDanhGiaRecordHandler,
} from "../controllers/danhgia.controller.js";

const router = Router();

router.post("/danh-gia-records/bulk", bulkUpsertDanhGiaRecordsHandler);
router.get("/danh-gia-records", listDanhGiaRecordsHandler);
router.put("/danh-gia-records/:id", updateDanhGiaRecordHandler);
router.delete("/danh-gia-records/:id", deleteDanhGiaRecordHandler);

export default router;

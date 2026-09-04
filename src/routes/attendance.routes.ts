import express, { Router } from "express";
import {
  deleteAttendanceHandler,
  deleteSelectedAttendanceHandler,
  importAttendanceHandler,
  listAttendanceHandler,
  markExcludedAttendanceHandler,
} from "../controllers/attendance.controller.js";

const router = Router();

// Body là bytes thô của file .xlsx (client gửi File object trực tiếp, không
// qua multipart form) — dùng express.raw() riêng cho route này, không ảnh
// hưởng express.json() dùng chung cho các route khác.
router.post(
  "/attendance-records/import",
  express.raw({ type: () => true, limit: "20mb" }),
  importAttendanceHandler,
);
router.get("/attendance-records", listAttendanceHandler);
router.post("/attendance-records/delete-selected", deleteSelectedAttendanceHandler);
router.post("/attendance-records/mark-excluded", markExcludedAttendanceHandler);
router.delete("/attendance-records/:id", deleteAttendanceHandler);

export default router;

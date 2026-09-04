import type { Request, Response } from "express";
import {
  deleteAttendanceRecord,
  deleteAttendanceRecords,
  listAttendanceRecords,
  parseAttendanceWorkbook,
  replaceAttendanceRecords,
  setAttendanceExcluded,
} from "../services/attendance.service.js";
import { getPeriod } from "../services/period.service.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

// POST /api/attendance-records/import?period_id=X — body là bytes thô của
// file .xlsx (client gửi trực tiếp File object, không dùng multipart form).
export async function importAttendanceHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: "Không nhận được nội dung file" });
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: "File vượt quá 20MB" });
  }

  try {
    const { headers, rows } = await parseAttendanceWorkbook(buffer);
    if (headers.length === 0) {
      return res.status(400).json({ error: "Không đọc được cột dữ liệu nào trong file — kiểm tra lại dòng tiêu đề (dòng 1)." });
    }
    const inserted = replaceAttendanceRecords(periodId, rows);
    res.status(201).json({ headers, rows: inserted });
  } catch {
    res.status(400).json({ error: "File không đúng định dạng Excel (.xlsx)" });
  }
}

// GET /api/attendance-records?period_id=X
export async function listAttendanceHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(listAttendanceRecords(periodId));
}

export async function deleteAttendanceHandler(req: Request, res: Response) {
  const ok = deleteAttendanceRecord(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).send();
}

export async function deleteSelectedAttendanceHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const deleted = deleteAttendanceRecords(ids.map((id: unknown) => Number(id)));
  res.json({ deleted });
}

// "Không tính đi muộn" — đánh dấu (hoặc bỏ đánh dấu, tùy 'excluded') các
// dòng Chấm công đã chọn để tab Nội quy bỏ qua/tính lại khi tính Lượt đi
// muộn, không xóa dữ liệu gốc.
export async function markExcludedAttendanceHandler(req: Request, res: Response) {
  const { ids, excluded } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = setAttendanceExcluded(ids.map((id: unknown) => Number(id)), excluded !== false);
  res.json({ updated });
}

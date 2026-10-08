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
import { parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, ScopeForbiddenError, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

// Phạm vi phòng ban của người gọi (Quy tắc 9.2) — fallback ALL khi
// req.dataScope chưa được gắn (SSO tắt ở dev/test), khớp các controller khác.
function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

// POST /api/attendance-records/import?period_id=X — body là bytes thô của
// file .xlsx (client gửi trực tiếp File object, không dùng multipart form).
export async function importAttendanceHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) {
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
    // Phòng ban đích do SERVER quyết định với tài khoản bị giới hạn (không
    // tin ?department_id= client — IDOR); scope.all mới được chọn phòng (hoặc
    // không chọn = thay toàn tháng, hành vi cũ).
    const scope = scopeOf(req);
    const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
    const departmentId = scope.all
      ? Number.isFinite(requested as number) ? requested : null
      : scope.departmentId;
    const inserted = await replaceAttendanceRecords(periodId, rows, departmentId, scope);
    res.status(201).json({ headers, rows: inserted });
  } catch (err) {
    if (err instanceof ScopeForbiddenError) throw err;
    res.status(400).json({ error: "File không đúng định dạng Excel (.xlsx)" });
  }
}

// GET /api/attendance-records?period_id=X
export async function listAttendanceHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(
    scopeOf(req),
    Number.isFinite(requested as number) ? requested : null,
  );
  if (departmentId === SCOPE_EMPTY) return res.json({ headers: [], rows: [] });
  res.json(await listAttendanceRecords(periodId, departmentId));
}

export async function deleteAttendanceHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteAttendanceRecord(id, scopeOf(req));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).send();
}

export async function deleteSelectedAttendanceHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const deleted = await deleteAttendanceRecords(ids.map((id: unknown) => Number(id)), scopeOf(req));
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
  const updated = await setAttendanceExcluded(ids.map((id: unknown) => Number(id)), excluded !== false, scopeOf(req));
  res.json({ updated });
}

import type { Request, Response } from "express";
import {
  deleteCbnvXepLoaiRecord,
  listCbnvXepLoai,
  updateCbnvXepLoaiRecord,
  upsertKiFromRanking,
} from "../services/summaryPlan.service.js";
import {
  buildCbnvXepLoaiImportTemplate,
  importCbnvXepLoaiFromWorkbook,
} from "../services/summaryPlanCbnv-import.service.js";
import { exportCbnvXepLoaiToExcel } from "../services/export.service.js";
import { getPeriod } from "../services/period.service.js";
import { listDepartments } from "../services/department.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

// GET /api/cbnv-xep-loai?period_id=X&department_id=Y
export async function listCbnvXepLoaiHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });

  const requestedDepartmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requestedDepartmentId);
  if (departmentId === SCOPE_EMPTY) return res.json([]);
  res.json(await listCbnvXepLoai(periodId, departmentId));
}

export async function updateCbnvXepLoaiHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  const { ho_va_ten } = req.body ?? {};
  if (!isNonEmptyText(ho_va_ten)) return res.status(400).json({ error: "Trường 'Họ và Tên' là bắt buộc" });
  const updated = await updateCbnvXepLoaiRecord(id, req.body, scopeOf(req));
  if (!updated) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.json(updated);
}

export async function deleteCbnvXepLoaiHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteCbnvXepLoaiRecord(id, scopeOf(req));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).end();
}

// GET /api/cbnv-xep-loai/import-template
export async function downloadCbnvXepLoaiTemplateHandler(_req: Request, res: Response) {
  const departments = await listDepartments();
  const buffer = await buildCbnvXepLoaiImportTemplate({ departments: departments.map((d) => d.name) });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="mau-cbnv-xep-loai.xlsx"`);
  res.send(Buffer.from(buffer));
}

// POST /api/cbnv-xep-loai/import?period_id=X&department_id=Y — body là bytes
// thô .xlsx. department_id (phòng đang xem) dùng làm fallback cho các dòng
// file KHÔNG điền cột "Phòng ban" — giống đúng logic import Yêu cầu tính
// năng (featureRequest-import.service.ts).
export async function importCbnvXepLoaiHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "Thiếu file .xlsx" });
  }
  const requestedDepartmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const scope = scopeOf(req);
  const fallbackDepartmentId = scope.all ? requestedDepartmentId : (scope.departmentId ?? null);
  try {
    const result = await importCbnvXepLoaiFromWorkbook(req.body, periodId, fallbackDepartmentId, scope);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Import thất bại" });
  }
}

// GET /api/cbnv-xep-loai/export?period_id=X&department_id=Y
export async function exportCbnvXepLoaiHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });

  const requestedDepartmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requestedDepartmentId);
  const rows = departmentId === SCOPE_EMPTY ? [] : await listCbnvXepLoai(periodId, departmentId);

  const buffer = await exportCbnvXepLoaiToExcel(rows, period.label);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="cbnv-xep-loai.xlsx"`);
  res.send(Buffer.from(buffer));
}

// POST /api/cbnv-xep-loai/fetch-ki { period_id, department_id, entries }
// "Lấy thông tin xếp loại" — entries ĐÃ được FE tính sẵn (đúng thuật toán
// Ranking team ở Trang chủ, xem CbnvKiEntry) cho MỌI team của phòng đang
// xem; server chỉ upsert, không tính lại gì.
export async function fetchKiHandler(req: Request, res: Response) {
  const { period_id, department_id, entries } = req.body ?? {};
  const periodId = Number(period_id);
  const period = await getPeriod(periodId);
  if (!period) return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  const departmentId = Number(department_id);
  if (!Number.isFinite(departmentId) || departmentId <= 0) {
    return res.status(400).json({ error: "Trường 'department_id' không hợp lệ" });
  }
  if (!Array.isArray(entries)) return res.status(400).json({ error: "Trường 'entries' phải là mảng" });

  const parsed = entries
    .filter((e: any) => Number.isFinite(Number(e?.member_id)) && e?.ho_va_ten)
    .map((e: any) => ({
      member_id: Number(e.member_id),
      ho_va_ten: String(e.ho_va_ten).trim(),
      to_nhom: String(e.to_nhom ?? "").trim(),
      xep_loai: String(e.xep_loai ?? "").trim(),
    }));

  const result = await upsertKiFromRanking(periodId, departmentId, parsed, scopeOf(req));
  res.json(result);
}

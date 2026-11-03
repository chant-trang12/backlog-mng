import type { Request, Response } from "express";
import {
  addOvertimePerson,
  createOvertimeBlocks,
  deleteOvertimeRecord,
  listOvertime,
  OvertimeError,
  updateOvertimeRecord,
} from "../services/overtime.service.js";
import { importOvertimeFromWorkbook } from "../services/overtime-import.service.js";
import { buildOvertimeWorkbook } from "../services/export.service.js";
import { getPeriod } from "../services/period.service.js";
import { parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}
// Phòng ban khi GHI: role bị giới hạn luôn là phòng của chính họ.
function writeDepartmentId(req: Request, requested: unknown): number | null {
  const scope = scopeOf(req);
  if (!scope.all) return scope.departmentId;
  return requested != null && requested !== "" ? Number(requested) : null;
}
function fail(res: Response, e: unknown) {
  if (e instanceof OvertimeError) return res.status(400).json({ error: e.message });
  throw e;
}

async function listFor(req: Request) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) return null;
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requested);
  const rows = departmentId === SCOPE_EMPTY ? [] : await listOvertime(periodId, departmentId);
  return { rows, period };
}

export async function listOvertimeHandler(req: Request, res: Response) {
  const r = await listFor(req);
  if (!r) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  res.json(r.rows);
}

export async function createOvertimeHandler(req: Request, res: Response) {
  const periodId = Number(req.body?.period_id);
  if (!(await getPeriod(periodId))) return res.status(400).json({ error: "period_id không hợp lệ" });
  try {
    if (req.body?.parent_id) {
      const parentId = parsePositiveInt(String(req.body.parent_id));
      if (!parentId) return res.status(400).json({ error: "parent_id không hợp lệ" });
      return res.status(201).json(await addOvertimePerson(parentId, req.body, scopeOf(req)));
    }
    await createOvertimeBlocks(periodId, writeDepartmentId(req, req.body?.department_id), [{ head: req.body, children: [] }], scopeOf(req));
    res.status(201).json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}

export async function updateOvertimeHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const row = await updateOvertimeRecord(id, req.body ?? {}, scopeOf(req));
    if (!row) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
    res.json(row);
  } catch (e) {
    fail(res, e);
  }
}

export async function deleteOvertimeHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await deleteOvertimeRecord(id, scopeOf(req)))) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).end();
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function overtimeTemplateHandler(_req: Request, res: Response) {
  const buffer = await buildOvertimeWorkbook([], { sample: true });
  res.setHeader("Content-Type", XLSX);
  res.setHeader("Content-Disposition", `attachment; filename="mau-lam-them-gio.xlsx"`);
  res.send(Buffer.from(buffer));
}

export async function exportOvertimeHandler(req: Request, res: Response) {
  const r = await listFor(req);
  if (!r) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  const buffer = await buildOvertimeWorkbook(r.rows, { title: `Làm thêm giờ — ${r.period.label}` });
  res.setHeader("Content-Type", XLSX);
  res.setHeader("Content-Disposition", `attachment; filename="lam-them-gio.xlsx"`);
  res.send(Buffer.from(buffer));
}

// POST /api/overtime/import?period_id=X&department_id=Y — body là bytes thô .xlsx.
export async function importOvertimeHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!(await getPeriod(periodId))) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Thiếu file .xlsx" });
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  try {
    const result = await importOvertimeFromWorkbook(req.body, periodId, writeDepartmentId(req, requested), scopeOf(req));
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Import thất bại" });
  }
}

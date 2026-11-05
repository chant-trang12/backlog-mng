import type { Request, Response } from "express";
import {
  createSummaryRecords,
  deleteSummaryRecord,
  importFromDetail,
  listSummary,
  OvertimeSummaryError,
  updateSummaryRecord,
} from "../services/overtimeSummary.service.js";
import { importOvertimeSummaryFromWorkbook } from "../services/overtimeSummary-import.service.js";
import { buildOvertimeSummaryWorkbook } from "../services/export.service.js";
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
  if (e instanceof OvertimeSummaryError) return res.status(400).json({ error: e.message });
  throw e;
}
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function listFor(req: Request) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) return null;
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requested);
  const data = departmentId === SCOPE_EMPTY ? { period, rows: [] } : await listSummary(periodId, departmentId);
  return { rows: data.rows, period };
}

export async function listSummaryHandler(req: Request, res: Response) {
  const r = await listFor(req);
  if (!r) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  res.json(r.rows);
}
export async function createSummaryHandler(req: Request, res: Response) {
  const periodId = Number(req.body?.period_id);
  if (!(await getPeriod(periodId))) return res.status(400).json({ error: "period_id không hợp lệ" });
  try {
    await createSummaryRecords(periodId, writeDepartmentId(req, req.body?.department_id), [req.body], scopeOf(req));
    res.status(201).json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
export async function updateSummaryHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const row = await updateSummaryRecord(id, req.body ?? {}, scopeOf(req));
    if (!row) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
    res.json(row);
  } catch (e) {
    fail(res, e);
  }
}
export async function deleteSummaryHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await deleteSummaryRecord(id, scopeOf(req)))) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).end();
}
export async function summaryTemplateHandler(_req: Request, res: Response) {
  const buffer = await buildOvertimeSummaryWorkbook([], { sample: true });
  res.setHeader("Content-Type", XLSX);
  res.setHeader("Content-Disposition", `attachment; filename="mau-tong-hop-lam-them-gio.xlsx"`);
  res.send(Buffer.from(buffer));
}
export async function exportSummaryHandler(req: Request, res: Response) {
  const r = await listFor(req);
  if (!r) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  const buffer = await buildOvertimeSummaryWorkbook(r.rows, { title: `Tổng hợp làm thêm giờ — ${r.period.label}`, month: r.period.month });
  res.setHeader("Content-Type", XLSX);
  res.setHeader("Content-Disposition", `attachment; filename="tong-hop-lam-them-gio.xlsx"`);
  res.send(Buffer.from(buffer));
}
export async function importSummaryHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!(await getPeriod(periodId))) return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Thiếu file .xlsx" });
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  try {
    res.status(201).json(await importOvertimeSummaryFromWorkbook(req.body, periodId, writeDepartmentId(req, requested), scopeOf(req)));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Import thất bại" });
  }
}
export async function fromDetailHandler(req: Request, res: Response) {
  const periodId = Number(req.body?.period_id);
  if (!(await getPeriod(periodId))) return res.status(400).json({ error: "period_id không hợp lệ" });
  try {
    res.json(await importFromDetail(periodId, writeDepartmentId(req, req.body?.department_id), scopeOf(req)));
  } catch (e) {
    fail(res, e);
  }
}

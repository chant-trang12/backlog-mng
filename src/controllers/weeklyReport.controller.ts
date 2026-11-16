import type { Request, Response } from "express";
import { getDepartment } from "../services/department.service.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";
import * as svc from "../services/weeklyReport.service.js";
import { buildWeeklyReportDocx } from "../services/weeklyReportDocx.service.js";
import { parsePositiveInt } from "../utils/validate.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}
function byUser(req: Request): string | null {
  return req.appUser?.name ?? req.appUser?.username ?? null;
}
// Phòng ban khi GHI: role bị giới hạn luôn là phòng của chính họ.
function writeDept(req: Request, requested: unknown): number | null {
  const scope = scopeOf(req);
  if (!scope.all) return scope.departmentId;
  const n = requested != null && requested !== "" ? Number(requested) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
function fail(res: Response, e: unknown) {
  if (e instanceof svc.WeeklyReportError) return res.status(400).json({ error: e.message });
  throw e;
}
const NEED_DEPT = { error: "Hãy chọn 1 phòng ban cụ thể ở bộ chuyển đổi phòng ban trước." };

async function readTarget(req: Request): Promise<{ departmentId: number; year: number; week: number } | { status: number; body: unknown }> {
  let w;
  try {
    w = svc.validateWeek(req.query.year, req.query.week);
  } catch (e) {
    return { status: 400, body: { error: (e as Error).message } };
  }
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  const d = resolveListDepartmentId(scopeOf(req), requested);
  if (d === SCOPE_EMPTY) return { status: 403, body: { error: "Bạn không có quyền xem dữ liệu phòng ban này." } };
  if (d == null) return { status: 400, body: NEED_DEPT };
  return { departmentId: d, ...w };
}

export async function getWeeklyHandler(req: Request, res: Response) {
  const t = await readTarget(req);
  if ("status" in t) return res.status(t.status).json(t.body);
  res.json(await svc.getWeekly(t.departmentId, t.year, t.week));
}

export async function exportWeeklyHandler(req: Request, res: Response) {
  const t = await readTarget(req);
  if ("status" in t) return res.status(t.status).json(t.body);
  const data = await svc.getWeekly(t.departmentId, t.year, t.week);
  const buffer = await buildWeeklyReportDocx(data);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="bc-tuan-${t.week}-${t.year}.docx"`);
  res.send(buffer);
}

export async function createRowHandler(req: Request, res: Response) {
  try {
    const w = svc.validateWeek(req.body?.year, req.body?.week);
    const d = writeDept(req, req.body?.department_id);
    if (d == null) return res.status(400).json(NEED_DEPT);
    res.status(201).json(await svc.createRow(d, w.year, w.week, req.body?.section, req.body ?? {}, scopeOf(req), byUser(req)));
  } catch (e) {
    fail(res, e);
  }
}

export async function updateRowHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const row = await svc.updateRow(id, req.body ?? {}, scopeOf(req));
    if (!row) return res.status(404).json({ error: "Không tìm thấy dòng" });
    res.json(row);
  } catch (e) {
    fail(res, e);
  }
}

export async function deleteRowHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await svc.deleteRow(id, scopeOf(req)))) return res.status(404).json({ error: "Không tìm thấy dòng" });
  res.status(204).end();
}

export async function moveRowHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  const dir = req.body?.direction === "down" ? "down" : "up";
  if (!(await svc.moveRow(id, dir, scopeOf(req)))) return res.status(404).json({ error: "Không tìm thấy dòng" });
  res.json({ ok: true });
}

export async function setCompanyHandler(req: Request, res: Response) {
  try {
    const w = svc.validateWeek(req.body?.year, req.body?.week);
    const d = writeDept(req, req.body?.department_id);
    if (d == null) return res.status(400).json(NEED_DEPT);
    res.json(await svc.setCompany(d, w.year, w.week, req.body?.ten_cong_ty, scopeOf(req), byUser(req)));
  } catch (e) {
    fail(res, e);
  }
}

export async function copyPreviousHandler(req: Request, res: Response) {
  try {
    const w = svc.validateWeek(req.body?.year, req.body?.week);
    const d = writeDept(req, req.body?.department_id);
    if (d == null) return res.status(400).json(NEED_DEPT);
    if (!(await getDepartment(d))) return res.status(400).json({ error: "Phòng ban không tồn tại." });
    res.json(await svc.copyFromPrevious(d, w.year, w.week, scopeOf(req), byUser(req)));
  } catch (e) {
    fail(res, e);
  }
}

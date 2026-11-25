import type { Request, Response } from "express";
import { getDepartment } from "../services/department.service.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";
import * as svc from "../services/weeklyReport.service.js";
import * as shr from "../services/weeklyReportShare.service.js";
import type { Actor } from "../services/reportShare.service.js";
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

// Người thao tác (để xét quyền xem BC tuần được chia sẻ) — cùng cách xác định với Báo cáo PowerPoint.
function actorOf(req: Request): Actor {
  const u = req.appUser;
  const scope = scopeOf(req);
  const asked = req.query.department_id != null ? Number(req.query.department_id) : null;
  const view = asked != null && Number.isInteger(asked) && asked > 0 && (scope.all || asked === scope.departmentId) ? asked : null;
  const home = u?.department_id ?? null;
  return { userId: u?.id ?? null, departmentId: home, name: u?.name ?? u?.username ?? null, departmentIds: [...(home != null ? [home] : []), ...(view != null ? [view] : [])], viewDepartmentId: view };
}

export async function viewSharedHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    res.json(await shr.viewReport(id, scopeOf(req), actorOf(req)));
  } catch (e) {
    fail(res, e);
  }
}
// Xuất Word cho BC tuần được chia sẻ (người nhận chỉ xem + xuất) — cùng quyền với viewSharedHandler.
export async function exportSharedHandler(req: Request, res: Response) {
  const id = parsePositiveInt(String(req.params.id ?? ""));
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const data = await shr.viewReport(id, scopeOf(req), actorOf(req));
    const buffer = await buildWeeklyReportDocx(data);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="bc-tuan-${data.week.week}-${data.week.year}.docx"`);
    res.send(buffer);
  } catch (e) {
    fail(res, e);
  }
}
export async function sharedWithMeHandler(req: Request, res: Response) {
  res.json(await shr.sharedWithMe(actorOf(req)));
}
export async function sharedUnseenHandler(req: Request, res: Response) {
  res.json({ count: await shr.unseenSharedCount(actorOf(req)) });
}
export async function listSharesHandler(req: Request, res: Response) {
  const t = await readTarget(req);
  if ("status" in t) return res.status(t.status).json(t.body);
  try {
    const report = await svc.findReport(t.departmentId, t.year, t.week);
    res.json(report ? await shr.listShares(report.id, scopeOf(req)) : []);
  } catch (e) {
    fail(res, e);
  }
}
export async function addShareHandler(req: Request, res: Response) {
  try {
    const w = svc.validateWeek(req.body?.year, req.body?.week);
    const d = writeDept(req, req.body?.department_id);
    if (d == null) return res.status(400).json(NEED_DEPT);
    const uid = Number(req.body?.user_id);
    const did = Number(req.body?.target_department_id);
    await shr.addShare(d, w.year, w.week, { user_id: uid || undefined, department_id: did || undefined }, actorOf(req), scopeOf(req));
    res.status(201).json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
export async function removeShareHandler(req: Request, res: Response) {
  const sid = parsePositiveInt(String(req.params.sid ?? ""));
  if (!sid) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await shr.removeShare(sid, scopeOf(req)))) return res.status(404).json({ error: "Không tìm thấy chia sẻ" });
  res.status(204).end();
}

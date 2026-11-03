import type { Request, Response } from "express";
import * as svc from "../services/gnv.service.js";
import { exportGnvToExcel } from "../services/export.service.js";
import { getPeriod } from "../services/period.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

// Phòng ban dùng khi TẠO nhóm: role bị giới hạn luôn là phòng của chính họ;
// admin/full-access dùng department_id client gửi.
function writeDepartmentId(req: Request, requested: unknown): number | null {
  const scope = scopeOf(req);
  if (!scope.all) return scope.departmentId;
  return requested != null && requested !== "" ? Number(requested) : null;
}

async function listFor(req: Request) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) return { error: "Query 'period_id' không hợp lệ" as const };
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requested);
  if (departmentId === SCOPE_EMPTY) return { groups: [], period };
  return { groups: await svc.listGnv(periodId, departmentId), period };
}

export async function listGnvHandler(req: Request, res: Response) {
  const r = await listFor(req);
  if ("error" in r) return res.status(400).json({ error: r.error });
  res.json(r.groups);
}

export async function exportGnvHandler(req: Request, res: Response) {
  const r = await listFor(req);
  if ("error" in r) return res.status(400).json({ error: r.error });
  const buffer = await exportGnvToExcel(r.groups, r.period.label);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="gnv.xlsx"`);
  res.send(Buffer.from(buffer));
}

export async function createGnvGroupHandler(req: Request, res: Response) {
  const periodId = Number(req.body?.period_id);
  if (!(await getPeriod(periodId))) return res.status(400).json({ error: "period_id không hợp lệ" });
  if (!isNonEmptyText(req.body?.ten_nhom)) return res.status(400).json({ error: "Hãy nhập tên nhóm" });
  try {
    res.status(201).json(await svc.createGroup(periodId, writeDepartmentId(req, req.body?.department_id), req.body.ten_nhom, scopeOf(req)));
  } catch (e) {
    if (e instanceof svc.GnvError) return res.status(400).json({ error: e.message });
    throw e;
  }
}

export async function updateGnvGroupHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  if (!isNonEmptyText(req.body?.ten_nhom)) return res.status(400).json({ error: "Hãy nhập tên nhóm" });
  const row = await svc.updateGroup(id, req.body.ten_nhom, scopeOf(req));
  if (!row) return res.status(404).json({ error: "Không tìm thấy nhóm" });
  res.json(row);
}

export async function deleteGnvGroupHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await svc.deleteGroup(id, scopeOf(req)))) return res.status(404).json({ error: "Không tìm thấy nhóm" });
  res.status(204).end();
}

export async function createGnvItemHandler(req: Request, res: Response) {
  const groupId = parsePositiveInt(String(req.body?.group_id ?? ""));
  if (!groupId) return res.status(400).json({ error: "group_id không hợp lệ" });
  try {
    const parentId = req.body?.parent_item_id ? parsePositiveInt(String(req.body.parent_item_id)) : null;
    if (parentId !== null && !parentId) return res.status(400).json({ error: "parent_item_id không hợp lệ" });
    res.status(201).json(await svc.createItem(groupId, req.body, scopeOf(req), parentId));
  } catch (e) {
    if (e instanceof svc.GnvError) return res.status(400).json({ error: e.message });
    throw e;
  }
}

export async function updateGnvItemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  let row;
  try {
    row = await svc.updateItem(id, req.body ?? {}, scopeOf(req));
  } catch (e) {
    if (e instanceof svc.GnvError) return res.status(400).json({ error: e.message });
    throw e;
  }
  if (!row) return res.status(404).json({ error: "Không tìm thấy dòng" });
  res.json(row);
}

export async function deleteGnvItemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await svc.deleteItem(id, scopeOf(req)))) return res.status(404).json({ error: "Không tìm thấy dòng" });
  res.status(204).end();
}

export async function addGnvItemsFromTasksHandler(req: Request, res: Response) {
  const groupId = parsePositiveInt(String(req.body?.group_id ?? ""));
  const taskIds = Array.isArray(req.body?.task_ids) ? req.body.task_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
  if (!groupId || taskIds.length === 0) return res.status(400).json({ error: "Thiếu group_id hoặc task_ids" });
  try {
    const parentRaw = req.body?.parent_item_id;
    const parentItemId = parentRaw ? parsePositiveInt(String(parentRaw)) : null;
    if (parentRaw && !parentItemId) return res.status(400).json({ error: "parent_item_id không hợp lệ" });
    res.json(await svc.addItemsFromTasks(groupId, taskIds, scopeOf(req), { merge: !!req.body?.merge, parentItemId }));
  } catch (e) {
    if (e instanceof svc.GnvError) return res.status(400).json({ error: e.message });
    throw e;
  }
}

export async function copyGnvHandler(req: Request, res: Response) {
  const sourcePeriodId = Number(req.body?.source_period_id);
  const targetPeriodId = Number(req.body?.target_period_id);
  if (!(await getPeriod(sourcePeriodId)) || !(await getPeriod(targetPeriodId))) {
    return res.status(400).json({ error: "Tháng nguồn/đích không hợp lệ" });
  }
  const selections = Array.isArray(req.body?.selections)
    ? req.body.selections.map((s: any) => ({
        group_id: Number(s?.group_id),
        item_ids: Array.isArray(s?.item_ids) ? s.item_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [],
      }))
    : [];
  try {
    res.json(
      await svc.copyFromPeriod(sourcePeriodId, targetPeriodId, writeDepartmentId(req, req.body?.department_id), selections, req.body?.with_methods !== false, scopeOf(req)),
    );
  } catch (e) {
    if (e instanceof svc.GnvError) return res.status(400).json({ error: e.message });
    throw e;
  }
}

import type { Request, Response } from "express";
import {
  addTaskItemMember,
  createTaskItem,
  deleteTaskItem,
  listTaskItems,
  listTreoViec,
  removeTaskItemMember,
  updateTaskItem,
  updateTaskItemMember,
} from "../services/taskItem.service.js";
import { getTask } from "../services/task.service.js";
import { parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

export async function listTaskItemsHandler(req: Request, res: Response) {
  const taskId = parsePositiveInt(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: "taskId không hợp lệ" });
  const task = await getTask(taskId);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(await listTaskItems(taskId));
}

export async function createTaskItemHandler(req: Request, res: Response) {
  const taskId = parsePositiveInt(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: "taskId không hợp lệ" });
  const task = await getTask(taskId);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  try {
    const { ten_viec, trang_thai, ghi_chu } = req.body ?? {};
    const row = await createTaskItem(taskId, { ten_viec, trang_thai, ghi_chu }, scopeOf(req));
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dữ liệu không hợp lệ" });
  }
}

export async function updateTaskItemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const { ten_viec, trang_thai, ghi_chu, treo_viec, treo_viec_ly_do, diem_danh_gia } = req.body ?? {};
    const row = await updateTaskItem(
      id,
      { ten_viec, trang_thai, ghi_chu, treo_viec, treo_viec_ly_do, diem_danh_gia },
      scopeOf(req),
      req.appUser?.name ?? null,
    );
    if (!row) return res.status(404).json({ error: "Không tìm thấy Việc" });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dữ liệu không hợp lệ" });
  }
}

export async function deleteTaskItemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteTaskItem(id, scopeOf(req), req.appUser?.name ?? null);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy Việc" });
  res.status(204).send();
}

export async function addTaskItemMemberHandler(req: Request, res: Response) {
  const taskItemId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(taskItemId)) return res.status(400).json({ error: "id không hợp lệ" });
  const memberId = Number(req.body?.member_id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return res.status(400).json({ error: "Trường 'member_id' là bắt buộc" });
  }
  try {
    const row = await addTaskItemMember(
      taskItemId,
      {
        member_id: memberId,
        gio_cong: req.body?.gio_cong,
        ghi_chu: req.body?.ghi_chu,
        phan_loai: req.body?.phan_loai,
        noi_dung_cong_viec: req.body?.noi_dung_cong_viec,
      },
      scopeOf(req),
    );
    if (!row) return res.status(404).json({ error: "Không tìm thấy Việc" });
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dữ liệu không hợp lệ" });
  }
}

export async function updateTaskItemMemberHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const row = await updateTaskItemMember(
    id,
    { gio_cong: req.body?.gio_cong, ghi_chu: req.body?.ghi_chu },
    scopeOf(req),
  );
  if (!row) return res.status(404).json({ error: "Không tìm thấy phân công" });
  res.json(row);
}

export async function removeTaskItemMemberHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await removeTaskItemMember(id, scopeOf(req));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy phân công" });
  res.status(204).send();
}

export async function listTreoViecHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!Number.isFinite(periodId) || periodId <= 0) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  const departmentId = resolveListDepartmentId(scopeOf(req), null);
  if (departmentId === SCOPE_EMPTY) return res.json([]);
  res.json(await listTreoViec(periodId, departmentId));
}

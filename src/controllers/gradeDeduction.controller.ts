import type { Request, Response } from "express";
import { addGradeDeduction, listGradeDeductionsForTask } from "../services/gradeDeduction.service.js";
import { getTask } from "../services/task.service.js";
import { parsePositiveInt } from "../utils/validate.js";
import { ScopeForbiddenError } from "../services/scope.util.js";

function scopeOf(req: Request) {
  return req.dataScope ?? { all: true, departmentId: null };
}

export async function listGradeDeductionsHandler(req: Request, res: Response) {
  const taskId = parsePositiveInt(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: "taskId không hợp lệ" });
  const task = await getTask(taskId);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(await listGradeDeductionsForTask(taskId));
}

export async function createGradeDeductionHandler(req: Request, res: Response) {
  const taskId = parsePositiveInt(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: "taskId không hợp lệ" });
  const memberId = Number(req.body?.member_id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return res.status(400).json({ error: "Trường 'member_id' là bắt buộc" });
  }
  try {
    const row = await addGradeDeduction(taskId, memberId, req.appUser?.name ?? null, scopeOf(req));
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof ScopeForbiddenError) return res.status(403).json({ error: "Không có quyền thao tác trên task này" });
    res.status(400).json({ error: err instanceof Error ? err.message : "Dữ liệu không hợp lệ" });
  }
}

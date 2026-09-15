import type { Request, Response } from "express";
import { getTask } from "../services/task.service.js";
import {
  createTaskMember,
  deleteTaskMember,
  listTaskMembers,
  updateTaskMember,
} from "../services/taskMember.service.js";
import { parsePositiveInt } from "../utils/validate.js";

// GET /api/tasks/:taskId/members — danh sách nhân sự tham gia 1 task.
export async function listTaskMembersHandler(req: Request, res: Response) {
  const taskId = parsePositiveInt(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: "taskId không hợp lệ" });
  const task = await getTask(taskId);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(await listTaskMembers(taskId));
}

// POST /api/tasks/:taskId/members — gán 1 nhân sự + vai trò vào task.
export async function createTaskMemberHandler(req: Request, res: Response) {
  const taskId = parsePositiveInt(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: "taskId không hợp lệ" });
  const task = await getTask(taskId);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });

  const memberId = Number(req.body?.member_id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return res.status(400).json({ error: "Trường 'member_id' là bắt buộc" });
  }
  const { vai_tro, ghi_chu } = req.body ?? {};
  const row = await createTaskMember(taskId, { member_id: memberId, vai_tro, ghi_chu });
  res.status(201).json(row);
}

export async function updateTaskMemberHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { vai_tro, ghi_chu } = req.body ?? {};
  const row = await updateTaskMember(id, { vai_tro, ghi_chu });
  if (!row) return res.status(404).json({ error: "Không tìm thấy dòng gán nhân sự" });
  res.json(row);
}

export async function deleteTaskMemberHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteTaskMember(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy dòng gán nhân sự" });
  res.status(204).send();
}

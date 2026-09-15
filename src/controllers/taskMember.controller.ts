import type { Request, Response } from "express";
import { getTask } from "../services/task.service.js";
import {
  createTaskMember,
  deleteTaskMember,
  listTaskMembers,
  updateTaskMember,
} from "../services/taskMember.service.js";
import { parsePositiveInt } from "../utils/validate.js";

// undefined -> không gửi field (giữ nguyên), null/"" -> xóa giá trị (về tự
// tính theo %), số hợp lệ -> set giá trị đó. Ném lỗi nếu gửi giá trị không
// phải số.
function toNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Giá trị phải là số");
  return n;
}

// GET /api/tasks/:taskId/members — danh sách nhân sự tham gia 1 task.
export async function listTaskMembersHandler(req: Request, res: Response) {
  const taskId = parsePositiveInt(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: "taskId không hợp lệ" });
  const task = await getTask(taskId);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(await listTaskMembers(taskId));
}

// POST /api/tasks/:taskId/members — gán 1 nhân sự vào task ("vai trò" hiển
// thị ở FE lấy thẳng theo Chức vụ có sẵn của nhân sự, không gửi kèm ở đây).
// Tỷ lệ đóng góp/điểm cá nhân thường chỉnh sau trên bảng, không bắt buộc.
export async function createTaskMemberHandler(req: Request, res: Response) {
  const taskId = parsePositiveInt(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: "taskId không hợp lệ" });
  const task = await getTask(taskId);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });

  const memberId = Number(req.body?.member_id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return res.status(400).json({ error: "Trường 'member_id' là bắt buộc" });
  }
  try {
    const { ghi_chu, phan_loai } = req.body ?? {};
    const row = await createTaskMember(taskId, {
      member_id: memberId,
      ghi_chu,
      phan_loai,
      ty_le_dong_gop: toNullableNumber(req.body?.ty_le_dong_gop),
      diem_ca_nhan: toNullableNumber(req.body?.diem_ca_nhan),
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dữ liệu không hợp lệ" });
  }
}

export async function updateTaskMemberHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const { ghi_chu, phan_loai } = req.body ?? {};
    const row = await updateTaskMember(id, {
      ghi_chu,
      phan_loai,
      ty_le_dong_gop: toNullableNumber(req.body?.ty_le_dong_gop),
      diem_ca_nhan: toNullableNumber(req.body?.diem_ca_nhan),
    });
    if (!row) return res.status(404).json({ error: "Không tìm thấy dòng gán nhân sự" });
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Dữ liệu không hợp lệ" });
  }
}

export async function deleteTaskMemberHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteTaskMember(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy dòng gán nhân sự" });
  res.status(204).send();
}

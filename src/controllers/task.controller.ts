import type { Request, Response } from "express";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  markTasksNoScore,
  moveTasksToNextMonth,
  updateTask,
} from "../services/task.service.js";
import { exportBacklogToExcel } from "../services/export.service.js";
import { getPeriod } from "../services/period.service.js";

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// 1.3 Nhập mới task cho một team trong tháng backlog `periodId`.
export async function createTaskHandler(req: Request, res: Response) {
  const periodId = Number(req.params.periodId);
  const period = getPeriod(periodId);
  if (!period) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });

  const { team, nhiem_vu } = req.body ?? {};
  if (!isNonEmptyText(team) || !isNonEmptyText(nhiem_vu)) {
    return res.status(400).json({ error: "Trường 'team' và 'nhiem_vu' là bắt buộc" });
  }

  const task = createTask(periodId, req.body ?? {});
  res.status(201).json(task);
}

export async function listTasksHandler(req: Request, res: Response) {
  const periodId = Number(req.params.periodId);
  const period = getPeriod(periodId);
  if (!period) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });

  const team = typeof req.query.team === "string" ? req.query.team : undefined;
  res.json(listTasks({ period_id: periodId, team }));
}

export async function getTaskHandler(req: Request, res: Response) {
  const task = getTask(Number(req.params.id));
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(task);
}

// 1.4 Cập nhật task (sửa nội dung hoặc cập nhật tiến độ: % hoàn thành, trạng
// thái, tiến độ, đánh giá CPO...).
export async function updateTaskHandler(req: Request, res: Response) {
  const task = updateTask(Number(req.params.id), req.body ?? {});
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(task);
}

export async function deleteTaskHandler(req: Request, res: Response) {
  const ok = deleteTask(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy task" });
  res.status(204).send();
}

// Chuyển các task đã chọn sang tháng kế tiếp (tự tạo tháng đích nếu chưa có),
// đánh dấu "Nhiệm vụ tồn" vào Tính chất.
export async function moveTasksToNextMonthHandler(req: Request, res: Response) {
  const periodId = Number(req.params.periodId);
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }

  const result = moveTasksToNextMonth(periodId, ids.map((id: unknown) => Number(id)));
  if (!result) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });
  res.json(result);
}

// Đánh dấu các task đã chọn là "Không tính điểm" (hiển thị ở cột Tính chất).
export async function markTasksNoScoreHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = markTasksNoScore(ids.map((id: unknown) => Number(id)));
  res.json({ updated });
}

// 1.5 Xuất Excel toàn bộ backlog của tháng (hoặc lọc theo team) theo mẫu.
export async function exportBacklogHandler(req: Request, res: Response) {
  const periodId = Number(req.params.periodId);
  const team = typeof req.query.team === "string" ? req.query.team : undefined;

  try {
    const buffer = await exportBacklogToExcel({ period_id: periodId, team });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="backlog.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
}

import type { Request, Response } from "express";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  markTasksNoScore,
  markTasksTon,
  unmarkTasksNoScore,
  moveTasksToNextMonth,
  updateTask,
} from "../services/task.service.js";
import { exportBacklogToExcel } from "../services/export.service.js";
import { buildTaskImportTemplate, importTasksFromWorkbook } from "../services/task-import.service.js";
import { getPeriod } from "../services/period.service.js";
import { listTeams } from "../services/team.service.js";
import { listTags } from "../services/tag.service.js";
import { listPhanLoai } from "../services/phanloai.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// 1.3 Nhập mới task cho một team trong tháng backlog `periodId`.
export async function createTaskHandler(req: Request, res: Response) {
  const periodId = parsePositiveInt(req.params.periodId);
  if (!Number.isFinite(periodId)) return res.status(400).json({ error: "periodId không hợp lệ" });
  const period = await getPeriod(periodId);
  if (!period) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });

  const { team, nhiem_vu } = req.body ?? {};
  if (!isNonEmptyText(team) || !isNonEmptyText(nhiem_vu)) {
    return res.status(400).json({ error: "Trường 'team' và 'nhiem_vu' là bắt buộc" });
  }

  const task = await createTask(periodId, req.body ?? {});
  res.status(201).json(task);
}

export async function listTasksHandler(req: Request, res: Response) {
  const periodId = parsePositiveInt(req.params.periodId);
  if (!Number.isFinite(periodId)) return res.status(400).json({ error: "periodId không hợp lệ" });
  const period = await getPeriod(periodId);
  if (!period) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });

  const team = typeof req.query.team === "string" ? req.query.team : undefined;
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  res.json(await listTasks({ period_id: periodId, team, department_id: departmentId }));
}

export async function getTaskHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const task = await getTask(id);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(task);
}

// 1.4 Cập nhật task (sửa nội dung hoặc cập nhật tiến độ: % hoàn thành, trạng
// thái, tiến độ, đánh giá CPO...).
export async function updateTaskHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const task = await updateTask(id, req.body ?? {});
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(task);
}

export async function deleteTaskHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteTask(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy task" });
  res.status(204).send();
}

// Chuyển các task đã chọn sang tháng kế tiếp (tự tạo tháng đích nếu chưa có),
// đánh dấu "Nhiệm vụ tồn" vào Tính chất.
export async function moveTasksToNextMonthHandler(req: Request, res: Response) {
  const periodId = parsePositiveInt(req.params.periodId);
  if (!Number.isFinite(periodId)) return res.status(400).json({ error: "periodId không hợp lệ" });
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }

  const result = await moveTasksToNextMonth(periodId, ids.map((id: unknown) => Number(id)));
  if (!result) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });
  res.json(result);
}

// Đánh dấu các task đã chọn là "Không tính điểm" (hiển thị ở cột Tính chất).
export async function markTasksNoScoreHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = await markTasksNoScore(ids.map((id: unknown) => Number(id)));
  res.json({ updated });
}

// Bỏ đánh dấu "Không tính điểm" cho các task đã chọn.
export async function unmarkTasksNoScoreHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = await unmarkTasksNoScore(ids.map((id: unknown) => Number(id)));
  res.json({ updated });
}

// Đánh dấu "Nhiệm vụ tồn" cho các task đã chọn — thêm "Nhiệm vụ tồn" vào cột
// Tính chất và đánh dấu Không tính điểm (không chuyển sang tháng sau).
export async function markTasksTonHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = await markTasksTon(ids.map((id: unknown) => Number(id)));
  res.json({ updated });
}

// 1.5 Xuất Excel toàn bộ backlog của tháng (hoặc lọc theo team) theo mẫu.
export async function exportBacklogHandler(req: Request, res: Response) {
  const periodId = parsePositiveInt(req.params.periodId);
  if (!Number.isFinite(periodId)) return res.status(400).json({ error: "periodId không hợp lệ" });
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

// GET /api/periods/:periodId/tasks/import-template?department_id=Y — file .xlsx
// mẫu nhập task, có sẵn dropdown chọn Team / Tag / Phân loại / Trạng thái.
export async function downloadTaskTemplateHandler(req: Request, res: Response) {
  const periodId = parsePositiveInt(req.params.periodId);
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const [teams, tags, phanLoai] = await Promise.all([
    Number.isFinite(periodId) ? listTeams(periodId, departmentId) : Promise.resolve([]),
    listTags(),
    listPhanLoai(),
  ]);
  const buffer = await buildTaskImportTemplate({
    teams: teams.map((t) => t.name),
    tags: tags.map((t) => t.ten_tag),
    phanLoai: phanLoai.map((p) => p.ten_phan_loai),
  });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="mau-nhap-nhiem-vu.xlsx"`);
  res.send(Buffer.from(buffer));
}

// POST /api/periods/:periodId/tasks/import?department_id=Y — body là bytes thô
// file .xlsx. Chỉ thêm mới; Team chưa có được tạo tự động.
export async function importTasksHandler(req: Request, res: Response) {
  const periodId = parsePositiveInt(req.params.periodId);
  if (!Number.isFinite(periodId)) return res.status(400).json({ error: "periodId không hợp lệ" });
  const period = await getPeriod(periodId);
  if (!period) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });

  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: "Không nhận được nội dung file" });
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: "File vượt quá 20MB" });
  }
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;

  try {
    const result = await importTasksFromWorkbook(periodId, buffer, departmentId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

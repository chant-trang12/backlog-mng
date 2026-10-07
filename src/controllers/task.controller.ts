import type { Request, Response } from "express";
import type { CreateTaskInput, UpdateTaskInput } from "../types/backlog.js";
import {
  createTask,
  deleteTask,
  deleteTasks,
  getTask,
  listTasks,
  markTasksNoScore,
  markTasksTon,
  unmarkTasksNoScore,
  unmarkTasksTon,
  moveTasksToNextMonth,
  updateTask,
  validateTaskCatalogInput,
} from "../services/task.service.js";
import { exportBacklogToExcel } from "../services/export.service.js";
import { buildTaskImportTemplate, importTasksFromWorkbook } from "../services/task-import.service.js";
import { getPeriod } from "../services/period.service.js";
import { listTeams } from "../services/team.service.js";
import { listTags } from "../services/tag.service.js";
import { listPhanLoai } from "../services/phanloai.service.js";
import { isNonEmptyText, parsePositiveInt, pickFields } from "../utils/validate.js";
import {
  resolveListDepartmentId,
  isDepartmentInScope,
  ScopeForbiddenError,
  SCOPE_EMPTY,
  type DataScope,
} from "../services/scope.util.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// ATTT Mass Assignment: whitelist trường của chức năng tạo/sửa task. Mọi
// tham số khác trong body (id, stt, period_id, cpo_danh_gia, cpo_comment,
// cpo_graded_by, creator/approver...) bị bỏ qua hoàn toàn — trường chấm điểm
// chỉ được sửa qua route riêng PUT /tasks/:id/grade (admin/BGĐ), các trường
// hệ thống do server tự gán.
const TASK_WRITE_FIELDS = [
  "team",
  "tinh_chat",
  "tag",
  "nhiem_vu",
  "dod",
  "ngay_thuc_hien",
  "deadline",
  "nvtt",
  "dau_moi_phoi_hop",
  "phan_tram_hoan_thanh",
  "trang_thai",
  "tien_do",
] as const;
const TASK_CREATE_FIELDS = [...TASK_WRITE_FIELDS, "department_id"] as const;
const TASK_UPDATE_FIELDS = [...TASK_WRITE_FIELDS, "replacement_task"] as const;

// Fallback chỉ dùng khi req.dataScope chưa được gắn (VD gọi handler trực
// tiếp ngoài chuỗi middleware bình thường, như 1 số test) — coi như không
// giới hạn, KHÔNG dùng làm cơ chế bảo mật thật (attachScope luôn chạy trước
// mọi route /api thật, xem app.ts).
function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

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

  const payload = pickFields(req.body, TASK_CREATE_FIELDS) as unknown as CreateTaskInput;
  const catalogError = await validateTaskCatalogInput(payload);
  if (catalogError) return res.status(400).json({ error: catalogError });

  const task = await createTask(periodId, payload, scopeOf(req));
  res.status(201).json(task);
}

export async function listTasksHandler(req: Request, res: Response) {
  const periodId = parsePositiveInt(req.params.periodId);
  if (!Number.isFinite(periodId)) return res.status(400).json({ error: "periodId không hợp lệ" });
  const period = await getPeriod(periodId);
  if (!period) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });

  const team = typeof req.query.team === "string" ? req.query.team : undefined;
  const requestedDepartmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requestedDepartmentId);
  if (departmentId === SCOPE_EMPTY) return res.json([]);
  res.json(await listTasks({ period_id: periodId, team, department_id: departmentId }));
}

export async function getTaskHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const task = await getTask(id);
  if (!task || !isDepartmentInScope(scopeOf(req), task.department_id)) {
    return res.status(404).json({ error: "Không tìm thấy task" });
  }
  res.json(task);
}

// 1.4 Cập nhật task (sửa nội dung hoặc cập nhật tiến độ: % hoàn thành, trạng
// thái, tiến độ, đánh giá CPO...).
export async function updateTaskHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    // ATTT Mass Assignment: chỉ nhận đúng các trường được phép của chức năng
    // sửa task — cpo_danh_gia/cpo_comment (chấm điểm) bị loại ở đây, chỉ đổi
    // được qua route riêng /grade; tham số lạ khác bị bỏ qua.
    const payload = pickFields(req.body, TASK_UPDATE_FIELDS) as unknown as UpdateTaskInput;
    const catalogError = await validateTaskCatalogInput(payload);
    if (catalogError) return res.status(400).json({ error: catalogError });
    const task = await updateTask(id, payload, scopeOf(req), req.appUser?.name ?? null);
    if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
    res.json(task);
  } catch (err: any) {
    // updateTask ném lỗi khi Hủy task quá sớm (<1/4 thời gian mục tiêu) mà
    // thiếu Nhiệm vụ thay thế — xem task.service.ts.
    res.status(400).json({ error: err?.message || "Không thể cập nhật task" });
  }
}

// Chấm điểm (nút "Chấm điểm" ở menu Nhiệm vụ) — route RIÊNG với sửa task
// thường ("PUT /tasks/:id" ở trên) để requireWrite chặn được đúng theo
// role (chỉ admin/bgd — xem auth.middleware.ts) mà không ảnh hưởng sửa
// nội dung/cập nhật tiến độ. CHỈ nhận đúng 2 trường cpo_danh_gia/
// cpo_comment — bỏ qua mọi trường khác lỡ gửi kèm, tránh route này bị lợi
// dụng để sửa cả nội dung task (phòng thủ ở tầng controller, không chỉ
// dựa vào FE chỉ gửi đúng field).
export async function updateTaskGradeHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const body = req.body ?? {};
  const payload: { cpo_danh_gia?: number; cpo_comment?: string } = {};
  if (body.cpo_danh_gia !== undefined) payload.cpo_danh_gia = body.cpo_danh_gia;
  if (body.cpo_comment !== undefined) payload.cpo_comment = body.cpo_comment;
  const task = await updateTask(id, payload, scopeOf(req), req.appUser?.name ?? null);
  if (!task) return res.status(404).json({ error: "Không tìm thấy task" });
  res.json(task);
}

export async function deleteTaskHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteTask(id, scopeOf(req));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy task" });
  res.status(204).send();
}

// Xóa nhiều task theo checkbox đã chọn trên bảng Danh sách nhiệm vụ.
export async function deleteSelectedTasksHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const deleted = await deleteTasks(ids.map((id: unknown) => Number(id)), scopeOf(req));
  res.json({ deleted });
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

  const result = await moveTasksToNextMonth(periodId, ids.map((id: unknown) => Number(id)), scopeOf(req));
  if (!result) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });
  res.json(result);
}

// Đánh dấu các task đã chọn là "Không tính điểm" (hiển thị ở cột Tính chất).
export async function markTasksNoScoreHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = await markTasksNoScore(ids.map((id: unknown) => Number(id)), scopeOf(req));
  res.json({ updated });
}

// Bỏ đánh dấu "Không tính điểm" cho các task đã chọn.
export async function unmarkTasksNoScoreHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = await unmarkTasksNoScore(ids.map((id: unknown) => Number(id)), scopeOf(req));
  res.json({ updated });
}

// Đánh dấu "Nhiệm vụ tồn" cho các task đã chọn — thêm "Nhiệm vụ tồn" vào cột
// Tính chất và đánh dấu Không tính điểm (không chuyển sang tháng sau).
export async function markTasksTonHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = await markTasksTon(ids.map((id: unknown) => Number(id)), scopeOf(req));
  res.json({ updated });
}

// Bỏ đánh dấu "Nhiệm vụ tồn" cho các task đã chọn.
export async function unmarkTasksTonHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const updated = await unmarkTasksTon(ids.map((id: unknown) => Number(id)));
  res.json({ updated });
}

// 1.5 Xuất Excel toàn bộ backlog của tháng (hoặc lọc theo team) theo mẫu.
export async function exportBacklogHandler(req: Request, res: Response) {
  const periodId = parsePositiveInt(req.params.periodId);
  if (!Number.isFinite(periodId)) return res.status(400).json({ error: "periodId không hợp lệ" });
  const team = typeof req.query.team === "string" ? req.query.team : undefined;
  const requestedDepartmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requestedDepartmentId);
  if (departmentId === SCOPE_EMPTY) {
    return res.status(403).json({ error: "Bạn không có quyền xem dữ liệu của phòng ban này." });
  }

  try {
    const buffer = await exportBacklogToExcel({ period_id: periodId, team, department_id: departmentId });
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
    const result = await importTasksFromWorkbook(periodId, buffer, departmentId, scopeOf(req));
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ScopeForbiddenError) throw err;
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

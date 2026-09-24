import type { Request, Response } from "express";
import {
  createRoadmapDetail,
  createRoadmapItem,
  deleteRoadmapDetail,
  deleteRoadmapItem,
  deleteRoadmapItems,
  listRoadmapDetails,
  listRoadmapItems,
  updateRoadmapDetail,
  updateRoadmapItem,
} from "../services/roadmap.service.js";
import {
  buildRoadmapImportTemplate,
  importRoadmapFromWorkbook,
} from "../services/roadmap-import.service.js";
import { listTeams } from "../services/team.service.js";
import { listHeThong } from "../services/hethong.service.js";
import { listMucTieu } from "../services/muctieu.service.js";
import { listPhanLoai } from "../services/phanloai.service.js";
import { exportRoadmapToExcel } from "../services/export.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, ScopeForbiddenError, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Xem ghi chú tương tự ở task.controller.ts#scopeOf.
function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

// GET /api/roadmap-items?year=YYYY&department_id=X
export async function listRoadmapItemsHandler(req: Request, res: Response) {
  const year = Number(req.query.year);
  if (!Number.isInteger(year)) {
    return res.status(400).json({ error: "Query 'year' không hợp lệ" });
  }
  const requestedDepartmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requestedDepartmentId);
  if (departmentId === SCOPE_EMPTY) return res.json([]);
  res.json(await listRoadmapItems({ year, department_id: departmentId }));
}

// GET /api/roadmap-items/export?year=YYYY&department_id=X — xuất toàn bộ
// roadmap của năm/phòng đang xem ra file .xlsx.
export async function exportRoadmapHandler(req: Request, res: Response) {
  const year = Number(req.query.year);
  if (!Number.isInteger(year)) {
    return res.status(400).json({ error: "Query 'year' không hợp lệ" });
  }
  const requestedDepartmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requestedDepartmentId);
  if (departmentId === SCOPE_EMPTY) {
    return res.status(403).json({ error: "Bạn không có quyền xem dữ liệu của phòng ban này." });
  }

  const buffer = await exportRoadmapToExcel({ year, department_id: departmentId });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="roadmap-${year}.xlsx"`);
  res.send(Buffer.from(buffer));
}

export async function createRoadmapItemHandler(req: Request, res: Response) {
  const body = req.body ?? {};
  const year = Number(body.year);
  if (!Number.isInteger(year)) {
    return res.status(400).json({ error: "Trường 'year' là bắt buộc" });
  }
  if (!isNonEmptyText(body.team) || !isNonEmptyText(body.nhiem_vu)) {
    return res.status(400).json({ error: "Trường 'team' và 'nhiem_vu' là bắt buộc" });
  }
  const item = await createRoadmapItem(
    {
      ...body,
      year,
      department_id: body.department_id != null ? Number(body.department_id) : null,
    },
    scopeOf(req),
  );
  res.status(201).json(item);
}

export async function updateRoadmapItemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const body = req.body ?? {};
  const item = await updateRoadmapItem(
    id,
    {
      ...body,
      year: body.year !== undefined ? Number(body.year) : undefined,
    },
    scopeOf(req),
  );
  if (!item) return res.status(404).json({ error: "Không tìm thấy dòng roadmap" });
  res.json(item);
}

export async function deleteRoadmapItemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteRoadmapItem(id, scopeOf(req));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy dòng roadmap" });
  res.status(204).send();
}

// Xóa nhiều dòng roadmap theo checkbox đã chọn trên bảng.
export async function deleteSelectedRoadmapItemsHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const deleted = await deleteRoadmapItems(ids.map((id: unknown) => Number(id)), scopeOf(req));
  res.json({ deleted });
}

// ---- Chi tiết công việc theo tháng ----

export async function listRoadmapDetailsHandler(req: Request, res: Response) {
  const itemId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(itemId)) return res.status(400).json({ error: "id không hợp lệ" });
  res.json(await listRoadmapDetails(itemId));
}

export async function createRoadmapDetailHandler(req: Request, res: Response) {
  const itemId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(itemId)) return res.status(400).json({ error: "id không hợp lệ" });
  const body = req.body ?? {};
  const month = Number(body.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: "'month' phải là số 1..12" });
  }
  if (!isNonEmptyText(body.noi_dung)) {
    return res.status(400).json({ error: "'noi_dung' là bắt buộc" });
  }
  res.status(201).json(await createRoadmapDetail(itemId, { ...body, month }));
}

export async function updateRoadmapDetailHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.detailId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const body = req.body ?? {};
  const detail = await updateRoadmapDetail(id, {
    ...body,
    month: body.month !== undefined ? Number(body.month) : undefined,
  });
  if (!detail) return res.status(404).json({ error: "Không tìm thấy chi tiết công việc" });
  res.json(detail);
}

export async function deleteRoadmapDetailHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.detailId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteRoadmapDetail(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy chi tiết công việc" });
  res.status(204).send();
}

// GET /api/roadmap-items/import-template?period_id=X&department_id=Y — file
// .xlsx mẫu nhập roadmap, có sẵn dropdown Team / Hệ thống / Mục tiêu /
// Phân loại theo đúng danh mục đang quản lý ở Cấu hình.
export async function downloadRoadmapTemplateHandler(req: Request, res: Response) {
  const periodId = req.query.period_id != null ? Number(req.query.period_id) : NaN;
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const [teams, heThong, mucTieu, phanLoai] = await Promise.all([
    Number.isFinite(periodId) ? listTeams(periodId, departmentId) : Promise.resolve([]),
    listHeThong(),
    listMucTieu(),
    listPhanLoai(),
  ]);
  const buffer = await buildRoadmapImportTemplate({
    teams: teams.map((t) => t.name),
    heThong: heThong.map((h) => h.ten_he_thong),
    mucTieu: mucTieu.map((m) => m.ten_muc_tieu),
    phanLoai: phanLoai.map((p) => p.ten_phan_loai),
  });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="mau-nhap-roadmap.xlsx"`);
  res.send(Buffer.from(buffer));
}

// POST /api/roadmap-items/import?year=YYYY&department_id=X — body là bytes thô .xlsx.
export async function importRoadmapHandler(req: Request, res: Response) {
  const year = Number(req.query.year);
  if (!Number.isInteger(year)) {
    return res.status(400).json({ error: "Query 'year' không hợp lệ" });
  }
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: "Không nhận được nội dung file" });
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: "File vượt quá 20MB" });
  }
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;

  try {
    const result = await importRoadmapFromWorkbook(year, buffer, departmentId, scopeOf(req));
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ScopeForbiddenError) throw err;
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

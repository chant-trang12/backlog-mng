import type { Request, Response } from "express";
import { parsePositiveInt, pickFields } from "../utils/validate.js";
import {
  createDigitalFeature,
  deleteDigitalFeature,
  deleteDigitalFeatures,
  DIGITAL_FEATURE_FIELDS,
  getDigitalFeature,
  listDigitalFeatures,
  updateDigitalFeature,
} from "../services/digitalFeature.service.js";
import type { CreateDigitalFeatureInput, DigitalFeatureFilters, UpdateDigitalFeatureInput } from "../types/digitalFeature.js";
import {
  buildDigitalFeatureTemplate,
  exportDigitalFeaturesToExcel,
  importDigitalFeaturesFromWorkbook,
} from "../services/digitalFeature-import.service.js";
import type { DataScope } from "../services/scope.util.js";
import { isDigitalFeatureInScope } from "../services/scope.util.js";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// Phạm vi phòng ban của người gọi (Quy tắc 9.2) — xem comment tương đương
// ở featureRequest.controller.ts.
function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

// Bộ lọc query dùng chung cho list + export (bấm "Xuất Excel" xuất đúng
// dữ liệu đang lọc — khớp hành vi bảng ở FE).
function filtersFromQuery(req: Request): DigitalFeatureFilters {
  const text = (key: string) => {
    const value = req.query[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  return {
    search: text("search"),
    module: text("module"),
    giai_doan: text("giai_doan"),
    tn_mh: text("tn_mh"),
    don_vi_chu_tri: text("don_vi_chu_tri"),
  };
}

// Quy tắc 9.2 — chỉ trả dòng thuộc phòng đang xem (department_id) hoặc dòng
// dùng chung (department_id NULL, dữ liệu cũ) — xem isDigitalFeatureInScope().
// scope.all (admin/phòng full-access) thấy toàn bộ.
export async function listDigitalFeaturesHandler(req: Request, res: Response) {
  const scope = scopeOf(req);
  res.json(await listDigitalFeatures(filtersFromQuery(req), scope.all ? null : scope.departmentId));
}

export async function getDigitalFeatureHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const item = await getDigitalFeature(id);
  if (!item || !isDigitalFeatureInScope(scopeOf(req), item.department_id)) {
    return res.status(404).json({ error: "Không tìm thấy tính năng" });
  }
  res.json(item);
}

export async function createDigitalFeatureHandler(req: Request, res: Response) {
  const payload = pickFields(req.body, DIGITAL_FEATURE_FIELDS) as unknown as CreateDigitalFeatureInput;
  if (!payload.module || !String(payload.module).trim()) {
    return res.status(400).json({ error: "Trường 'module' là bắt buộc" });
  }
  // Gán phòng ban theo người đang thao tác (Quy tắc 9.2) — KHÔNG nhận từ
  // client (department_id không nằm trong DIGITAL_FEATURE_FIELDS nên
  // pickFields đã tự loại). scope.all (admin/phòng full-access) để NULL —
  // dữ liệu "dùng chung", khớp hành vi dữ liệu cũ.
  const scope = scopeOf(req);
  payload.department_id = scope.all ? null : scope.departmentId;
  try {
    const created = await createDigitalFeature(payload);
    res.status(201).json(created);
  } catch (err) {
    // Lỗi nghiệp vụ duy nhất ở create hiện tại là trùng Mã.
    res.status(400).json({ error: err instanceof Error ? err.message : "Không tạo được tính năng" });
  }
}

export async function updateDigitalFeatureHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const existing = await getDigitalFeature(id);
  if (!existing || !isDigitalFeatureInScope(scopeOf(req), existing.department_id)) {
    return res.status(404).json({ error: "Không tìm thấy tính năng" });
  }
  const payload = pickFields(req.body, DIGITAL_FEATURE_FIELDS) as unknown as UpdateDigitalFeatureInput;
  try {
    const updated = await updateDigitalFeature(id, payload);
    if (!updated) return res.status(404).json({ error: "Không tìm thấy tính năng" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Không sửa được tính năng" });
  }
}

export async function deleteDigitalFeatureHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const existing = await getDigitalFeature(id);
  if (!existing || !isDigitalFeatureInScope(scopeOf(req), existing.department_id)) {
    return res.status(404).json({ error: "Không tìm thấy tính năng" });
  }
  const ok = await deleteDigitalFeature(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy tính năng" });
  res.status(204).send();
}

// Xóa nhiều tính năng đã chọn (checkbox trên bảng) — admin/subadmin gọi tới
// được (chặn ở app.ts qua requireAdminOrSubAdmin). subadmin bị giới hạn 1
// phòng ban thì chỉ xóa được dòng trong phạm vi phòng mình (hoặc dòng dùng
// chung department_id NULL) — scope.all (admin/phòng full-access) xóa
// được mọi dòng trong danh sách chọn.
export async function deleteSelectedDigitalFeaturesHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const numericIds = ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id));
  const scope = scopeOf(req);
  const deleted = await deleteDigitalFeatures(numericIds, scope.all ? null : scope.departmentId);
  res.json({ deleted });
}

export async function downloadDigitalFeatureTemplateHandler(_req: Request, res: Response) {
  const buffer = await buildDigitalFeatureTemplate();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="mau-tinh-nang-so-hoa.xlsx"`);
  res.send(Buffer.from(buffer));
}

export async function importDigitalFeaturesHandler(req: Request, res: Response) {
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: "Không nhận được nội dung file" });
  }
  if (buffer.length > MAX_IMPORT_BYTES) {
    return res.status(400).json({ error: "File vượt quá 20MB" });
  }
  const scope = scopeOf(req);
  try {
    const result = await importDigitalFeaturesFromWorkbook(buffer, scope.all ? null : scope.departmentId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

// Xuất đúng dữ liệu đang xem (đã lọc theo phòng ban + bộ lọc trên bảng) —
// khớp hành vi "Xuất Excel xuất đúng dữ liệu đang lọc" ở các nơi khác.
export async function exportDigitalFeaturesHandler(req: Request, res: Response) {
  const scope = scopeOf(req);
  const buffer = await exportDigitalFeaturesToExcel(filtersFromQuery(req), scope.all ? null : scope.departmentId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="tinh-nang-so-hoa.xlsx"`);
  res.send(Buffer.from(buffer));
}

import type { Request, Response } from "express";
import { parsePositiveInt, pickFields } from "../utils/validate.js";
import {
  createDigitalFeatureMasterData,
  deleteDigitalFeatureMasterData,
  deleteDigitalFeatureMasterDataList,
  DIGITAL_FEATURE_MD_FIELDS,
  getDigitalFeatureMasterData,
  listDigitalFeatureMasterData,
  updateDigitalFeatureMasterData,
} from "../services/digitalFeatureMasterData.service.js";
import type {
  CreateDigitalFeatureMasterDataInput,
  UpdateDigitalFeatureMasterDataInput,
} from "../types/digitalFeature.js";
import {
  buildDigitalFeatureMdTemplate,
  exportDigitalFeatureMdToExcel,
  importDigitalFeatureMdFromWorkbook,
} from "../services/digitalFeatureMasterData-import.service.js";
import { isDigitalFeatureIdInScope } from "../services/digitalFeature.service.js";
import type { DataScope } from "../services/scope.util.js";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// Phạm vi phòng ban của người gọi (Quy tắc 9.2).
function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

// Whitelist payload — digital_feature_id cố tình bỏ (lấy từ path để không
// đổi được module cha khi sửa dòng).
function mdPayload(req: Request) {
  return pickFields(req.body, DIGITAL_FEATURE_MD_FIELDS) as unknown as UpdateDigitalFeatureMasterDataInput;
}

export async function listDigitalFeatureMasterDataHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await isDigitalFeatureIdInScope(scopeOf(req), featureId))) {
    return res.status(404).json({ error: "Không tìm thấy tính năng" });
  }
  res.json(await listDigitalFeatureMasterData(featureId));
}

export async function createDigitalFeatureMasterDataHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await isDigitalFeatureIdInScope(scopeOf(req), featureId))) {
    return res.status(404).json({ error: "Không tìm thấy tính năng" });
  }
  const payload = mdPayload(req) as unknown as CreateDigitalFeatureMasterDataInput;
  if (!payload.ten_danh_muc || !String(payload.ten_danh_muc).trim()) {
    return res.status(400).json({ error: "Trường 'ten_danh_muc' là bắt buộc" });
  }
  try {
    const created = await createDigitalFeatureMasterData({ ...payload, digital_feature_id: featureId });
    res.status(201).json(created);
  } catch (err) {
    // Lỗi nghiệp vụ: thiếu tên, module cha không tồn tại, trùng Mã danh mục.
    const message = err instanceof Error ? err.message : "Không tạo được danh mục";
    const status = message.includes("Không tìm thấy tính năng") ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

export async function updateDigitalFeatureMasterDataHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const existing = await getDigitalFeatureMasterData(id);
  if (!existing || !(await isDigitalFeatureIdInScope(scopeOf(req), existing.digital_feature_id))) {
    return res.status(404).json({ error: "Không tìm thấy danh mục" });
  }
  try {
    const updated = await updateDigitalFeatureMasterData(id, mdPayload(req));
    if (!updated) return res.status(404).json({ error: "Không tìm thấy danh mục" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Không sửa được danh mục" });
  }
}

export async function deleteDigitalFeatureMasterDataHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const existing = await getDigitalFeatureMasterData(id);
  if (!existing || !(await isDigitalFeatureIdInScope(scopeOf(req), existing.digital_feature_id))) {
    return res.status(404).json({ error: "Không tìm thấy danh mục" });
  }
  const ok = await deleteDigitalFeatureMasterData(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy danh mục" });
  res.status(204).send();
}

// Xóa nhiều danh mục đã chọn (checkbox bảng) — chỉ admin (chặn ở app.ts
// theo tiền tố path, cùng cách digital-features/delete-selected).
export async function deleteSelectedDigitalFeatureMasterDataHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const numericIds = ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id));
  const deleted = await deleteDigitalFeatureMasterDataList(numericIds);
  res.json({ deleted });
}

export async function downloadDigitalFeatureMdTemplateHandler(_req: Request, res: Response) {
  const buffer = await buildDigitalFeatureMdTemplate();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="mau-danh-muc-master-data.xlsx"`);
  res.send(Buffer.from(buffer));
}

export async function importDigitalFeatureMasterDataHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await isDigitalFeatureIdInScope(scopeOf(req), featureId))) {
    return res.status(404).json({ error: "Không tìm thấy tính năng" });
  }
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: "Không nhận được nội dung file" });
  }
  if (buffer.length > MAX_IMPORT_BYTES) {
    return res.status(400).json({ error: "File vượt quá 20MB" });
  }
  try {
    const result = await importDigitalFeatureMdFromWorkbook(buffer, featureId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

export async function exportDigitalFeatureMasterDataHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await isDigitalFeatureIdInScope(scopeOf(req), featureId))) {
    return res.status(404).json({ error: "Không tìm thấy tính năng" });
  }
  const buffer = await exportDigitalFeatureMdToExcel(featureId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="danh-muc-master-data.xlsx"`);
  res.send(Buffer.from(buffer));
}

// GET 1 danh mục (dùng cho test/sửa từ link trực tiếp).
export async function getDigitalFeatureMasterDataHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const item = await getDigitalFeatureMasterData(id);
  if (!item || !(await isDigitalFeatureIdInScope(scopeOf(req), item.digital_feature_id))) {
    return res.status(404).json({ error: "Không tìm thấy danh mục" });
  }
  res.json(item);
}

import type { Request, Response } from "express";
import { parsePositiveInt, pickFields } from "../utils/validate.js";
import {
  createDigitalFeatureDataObject,
  deleteDigitalFeatureDataObject,
  deleteDigitalFeatureDataObjectList,
  DIGITAL_FEATURE_DO_FIELDS,
  getDigitalFeatureDataObject,
  listDigitalFeatureDataObjects,
  updateDigitalFeatureDataObject,
} from "../services/digitalFeatureDataObject.service.js";
import type {
  CreateDigitalFeatureDataObjectInput,
  UpdateDigitalFeatureDataObjectInput,
} from "../types/digitalFeature.js";
import {
  buildDigitalFeatureDoTemplate,
  exportDigitalFeatureDoToExcel,
  importDigitalFeatureDoFromWorkbook,
} from "../services/digitalFeatureDataObject-import.service.js";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// Whitelist payload — digital_feature_id cố tình bỏ (lấy từ path để không
// đổi được module cha khi sửa dòng).
function doPayload(req: Request) {
  return pickFields(req.body, DIGITAL_FEATURE_DO_FIELDS) as unknown as UpdateDigitalFeatureDataObjectInput;
}

export async function listDigitalFeatureDataObjectsHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  res.json(await listDigitalFeatureDataObjects(featureId));
}

export async function createDigitalFeatureDataObjectHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  const payload = doPayload(req) as unknown as CreateDigitalFeatureDataObjectInput;
  if (!payload.ten_doi_tuong || !String(payload.ten_doi_tuong).trim()) {
    return res.status(400).json({ error: "Trường 'ten_doi_tuong' là bắt buộc" });
  }
  try {
    const created = await createDigitalFeatureDataObject({ ...payload, digital_feature_id: featureId });
    res.status(201).json(created);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không tạo được đối tượng dữ liệu";
    const status = message.includes("Không tìm thấy tính năng") ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

export async function updateDigitalFeatureDataObjectHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const updated = await updateDigitalFeatureDataObject(id, doPayload(req));
    if (!updated) return res.status(404).json({ error: "Không tìm thấy đối tượng dữ liệu" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Không sửa được đối tượng dữ liệu" });
  }
}

export async function deleteDigitalFeatureDataObjectHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteDigitalFeatureDataObject(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy đối tượng dữ liệu" });
  res.status(204).send();
}

// Xóa nhiều đối tượng đã chọn (checkbox bảng) — chỉ admin (chặn ở app.ts
// theo tiền tố path, cùng cách digital-features/delete-selected).
export async function deleteSelectedDigitalFeatureDataObjectsHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const numericIds = ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id));
  const deleted = await deleteDigitalFeatureDataObjectList(numericIds);
  res.json({ deleted });
}

export async function downloadDigitalFeatureDoTemplateHandler(_req: Request, res: Response) {
  const buffer = await buildDigitalFeatureDoTemplate();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="mau-doi-tuong-du-lieu-vong-doi.xlsx"`);
  res.send(Buffer.from(buffer));
}

export async function importDigitalFeatureDataObjectsHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: "Không nhận được nội dung file" });
  }
  if (buffer.length > MAX_IMPORT_BYTES) {
    return res.status(400).json({ error: "File vượt quá 20MB" });
  }
  try {
    const result = await importDigitalFeatureDoFromWorkbook(buffer, featureId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

export async function exportDigitalFeatureDataObjectsHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  const buffer = await exportDigitalFeatureDoToExcel(featureId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="doi-tuong-du-lieu-vong-doi.xlsx"`);
  res.send(Buffer.from(buffer));
}

// GET 1 đối tượng (dùng cho test/sửa từ link trực tiếp).
export async function getDigitalFeatureDataObjectHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const item = await getDigitalFeatureDataObject(id);
  if (!item) return res.status(404).json({ error: "Không tìm thấy đối tượng dữ liệu" });
  res.json(item);
}

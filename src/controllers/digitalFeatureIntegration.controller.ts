import type { Request, Response } from "express";
import { parsePositiveInt, pickFields } from "../utils/validate.js";
import {
  createDigitalFeatureIntegration,
  deleteDigitalFeatureIntegration,
  deleteDigitalFeatureIntegrationList,
  DIGITAL_FEATURE_INT_FIELDS,
  getDigitalFeatureIntegration,
  listDigitalFeatureIntegrations,
  updateDigitalFeatureIntegration,
} from "../services/digitalFeatureIntegration.service.js";
import type {
  CreateDigitalFeatureIntegrationInput,
  UpdateDigitalFeatureIntegrationInput,
} from "../types/digitalFeature.js";
import {
  buildDigitalFeatureIntTemplate,
  exportDigitalFeatureIntToExcel,
  importDigitalFeatureIntFromWorkbook,
} from "../services/digitalFeatureIntegration-import.service.js";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// Whitelist payload — digital_feature_id cố tình bỏ (lấy từ path để không
// đổi được module cha khi sửa dòng).
function intPayload(req: Request) {
  return pickFields(req.body, DIGITAL_FEATURE_INT_FIELDS) as unknown as UpdateDigitalFeatureIntegrationInput;
}

export async function listDigitalFeatureIntegrationsHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  res.json(await listDigitalFeatureIntegrations(featureId));
}

export async function createDigitalFeatureIntegrationHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  const payload = intPayload(req) as unknown as CreateDigitalFeatureIntegrationInput;
  if (!payload.huong || !String(payload.huong).trim()) {
    return res.status(400).json({ error: "Trường 'huong' là bắt buộc" });
  }
  try {
    const created = await createDigitalFeatureIntegration({ ...payload, digital_feature_id: featureId });
    res.status(201).json(created);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không tạo được luồng tích hợp";
    const status = message.includes("Không tìm thấy tính năng") ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

export async function updateDigitalFeatureIntegrationHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const updated = await updateDigitalFeatureIntegration(id, intPayload(req));
    if (!updated) return res.status(404).json({ error: "Không tìm thấy luồng tích hợp" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Không sửa được luồng tích hợp" });
  }
}

export async function deleteDigitalFeatureIntegrationHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteDigitalFeatureIntegration(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy luồng tích hợp" });
  res.status(204).send();
}

// Xóa nhiều luồng tích hợp đã chọn (checkbox bảng) — chỉ admin (chặn ở
// app.ts theo tiền tố path, cùng cách digital-features/delete-selected).
export async function deleteSelectedDigitalFeatureIntegrationsHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const numericIds = ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id));
  const deleted = await deleteDigitalFeatureIntegrationList(numericIds);
  res.json({ deleted });
}

export async function downloadDigitalFeatureIntTemplateHandler(_req: Request, res: Response) {
  const buffer = await buildDigitalFeatureIntTemplate();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="mau-tich-hop-su-kien.xlsx"`);
  res.send(Buffer.from(buffer));
}

export async function importDigitalFeatureIntegrationsHandler(req: Request, res: Response) {
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
    const result = await importDigitalFeatureIntFromWorkbook(buffer, featureId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

export async function exportDigitalFeatureIntegrationsHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  const buffer = await exportDigitalFeatureIntToExcel(featureId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="tich-hop-su-kien.xlsx"`);
  res.send(Buffer.from(buffer));
}

// GET 1 luồng tích hợp (dùng cho test/sửa từ link trực tiếp).
export async function getDigitalFeatureIntegrationHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const item = await getDigitalFeatureIntegration(id);
  if (!item) return res.status(404).json({ error: "Không tìm thấy luồng tích hợp" });
  res.json(item);
}

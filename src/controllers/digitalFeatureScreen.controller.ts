import type { Request, Response } from "express";
import { parsePositiveInt, pickFields } from "../utils/validate.js";
import {
  createDigitalFeatureScreen,
  deleteDigitalFeatureScreen,
  deleteDigitalFeatureScreens,
  DIGITAL_FEATURE_SCREEN_FIELDS,
  getDigitalFeatureScreen,
  listDigitalFeatureScreens,
  updateDigitalFeatureScreen,
} from "../services/digitalFeatureScreen.service.js";
import type { CreateDigitalFeatureScreenInput, UpdateDigitalFeatureScreenInput } from "../types/digitalFeature.js";
import {
  buildDigitalFeatureScreenTemplate,
  exportDigitalFeatureScreensToExcel,
  importDigitalFeatureScreensFromWorkbook,
} from "../services/digitalFeatureScreen-import.service.js";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// Whitelist payload — digital_feature_id cố tình bỏ (lấy từ path để không
// đổi được module cha khi sửa dòng).
function screenPayload(req: Request) {
  return pickFields(req.body, DIGITAL_FEATURE_SCREEN_FIELDS) as unknown as UpdateDigitalFeatureScreenInput;
}

export async function listDigitalFeatureScreensHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  res.json(await listDigitalFeatureScreens(featureId));
}

export async function createDigitalFeatureScreenHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  const payload = screenPayload(req) as unknown as CreateDigitalFeatureScreenInput;
  if (!payload.ten_man_hinh || !String(payload.ten_man_hinh).trim()) {
    return res.status(400).json({ error: "Trường 'ten_man_hinh' là bắt buộc" });
  }
  try {
    const created = await createDigitalFeatureScreen({ ...payload, digital_feature_id: featureId });
    res.status(201).json(created);
  } catch (err) {
    // Lỗi nghiệp vụ: thiếu tên, module cha không tồn tại, trùng Mã MH.
    const message = err instanceof Error ? err.message : "Không tạo được màn hình";
    const status = message.includes("Không tìm thấy tính năng") ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

export async function updateDigitalFeatureScreenHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const updated = await updateDigitalFeatureScreen(id, screenPayload(req));
    if (!updated) return res.status(404).json({ error: "Không tìm thấy màn hình" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Không sửa được màn hình" });
  }
}

export async function deleteDigitalFeatureScreenHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteDigitalFeatureScreen(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy màn hình" });
  res.status(204).send();
}

// Xóa nhiều màn hình đã chọn (checkbox bảng) — chỉ admin (chặn ở app.ts
// theo tiền tố path, cùng cách digital-features/delete-selected).
export async function deleteSelectedDigitalFeatureScreensHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const numericIds = ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id));
  const deleted = await deleteDigitalFeatureScreens(numericIds);
  res.json({ deleted });
}

export async function downloadDigitalFeatureScreenTemplateHandler(_req: Request, res: Response) {
  const buffer = await buildDigitalFeatureScreenTemplate();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="mau-man-hinh-phan-quyen.xlsx"`);
  res.send(Buffer.from(buffer));
}

export async function importDigitalFeatureScreensHandler(req: Request, res: Response) {
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
    const result = await importDigitalFeatureScreensFromWorkbook(buffer, featureId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

export async function exportDigitalFeatureScreensHandler(req: Request, res: Response) {
  const featureId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(featureId)) return res.status(400).json({ error: "id không hợp lệ" });
  const buffer = await exportDigitalFeatureScreensToExcel(featureId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="man-hinh-phan-quyen.xlsx"`);
  res.send(Buffer.from(buffer));
}

// GET 1 màn hình (dùng cho test/sửa từ link trực tiếp).
export async function getDigitalFeatureScreenHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const item = await getDigitalFeatureScreen(id);
  if (!item) return res.status(404).json({ error: "Không tìm thấy màn hình" });
  res.json(item);
}

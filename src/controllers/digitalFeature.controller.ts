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

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

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

export async function listDigitalFeaturesHandler(req: Request, res: Response) {
  res.json(await listDigitalFeatures(filtersFromQuery(req)));
}

export async function getDigitalFeatureHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const item = await getDigitalFeature(id);
  if (!item) return res.status(404).json({ error: "Không tìm thấy tính năng" });
  res.json(item);
}

export async function createDigitalFeatureHandler(req: Request, res: Response) {
  const payload = pickFields(req.body, DIGITAL_FEATURE_FIELDS) as unknown as CreateDigitalFeatureInput;
  if (!payload.module || !String(payload.module).trim()) {
    return res.status(400).json({ error: "Trường 'module' là bắt buộc" });
  }
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
  const ok = await deleteDigitalFeature(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy tính năng" });
  res.status(204).send();
}

// Xóa nhiều tính năng đã chọn (checkbox trên bảng) — CHỈ admin gọi tới được
// (chặn ở app.ts qua requireAdmin, scope đúng tiền tố route này — cùng cách
// làm với /api/feature-requests/delete-selected).
export async function deleteSelectedDigitalFeaturesHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const numericIds = ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id));
  const deleted = await deleteDigitalFeatures(numericIds);
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
  try {
    const result = await importDigitalFeaturesFromWorkbook(buffer);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}

export async function exportDigitalFeaturesHandler(req: Request, res: Response) {
  const buffer = await exportDigitalFeaturesToExcel(filtersFromQuery(req));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="tinh-nang-so-hoa.xlsx"`);
  res.send(Buffer.from(buffer));
}

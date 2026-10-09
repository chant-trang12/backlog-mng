import { db } from "../db/database.js";
import type {
  CreateDigitalFeatureDataObjectInput,
  DigitalFeatureDataObject,
  UpdateDigitalFeatureDataObjectInput,
} from "../types/digitalFeature.js";

// Các cột text của bảng digital_feature_data_objects — dùng chung cho
// insert/update (service) và whitelist controller.
export const DIGITAL_FEATURE_DO_FIELDS = [
  "ten_doi_tuong",
  "khoa_thuoc_tinh",
  "vong_doi_trang_thai",
] as const;

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

async function featureExists(digitalFeatureId: number): Promise<boolean> {
  const row = await db("digital_features").where({ id: digitalFeatureId, is_deleted: false }).first();
  return !!row;
}

export async function getDigitalFeatureDataObject(
  id: number,
): Promise<DigitalFeatureDataObject | undefined> {
  const row = await db("digital_feature_data_objects").where({ id, is_deleted: false }).first();
  return (row as DigitalFeatureDataObject) ?? undefined;
}

export async function listDigitalFeatureDataObjects(
  digitalFeatureId: number,
): Promise<DigitalFeatureDataObject[]> {
  const rows = await db("digital_feature_data_objects")
    .where({ digital_feature_id: digitalFeatureId, is_deleted: false })
    .select("*")
    .orderBy("id", "asc");
  return rows as DigitalFeatureDataObject[];
}

export async function createDigitalFeatureDataObject(
  input: CreateDigitalFeatureDataObjectInput,
): Promise<DigitalFeatureDataObject> {
  if (!(await featureExists(input.digital_feature_id))) {
    throw new Error("Không tìm thấy tính năng số hoá");
  }
  const tenDoiTuong = input.ten_doi_tuong.trim();
  if (!tenDoiTuong) {
    throw new Error("Trường 'ten_doi_tuong' là bắt buộc");
  }
  const values: Record<string, unknown> = {
    digital_feature_id: input.digital_feature_id,
    ten_doi_tuong: tenDoiTuong,
    khoa_thuoc_tinh: cleanText(input.khoa_thuoc_tinh),
    vong_doi_trang_thai: cleanText(input.vong_doi_trang_thai),
    updated_at: db.fn.now(),
  };
  const [created] = await db("digital_feature_data_objects").insert(values).returning("*");
  return created as DigitalFeatureDataObject;
}

export async function updateDigitalFeatureDataObject(
  id: number,
  input: UpdateDigitalFeatureDataObjectInput,
): Promise<DigitalFeatureDataObject | undefined> {
  const existing = await getDigitalFeatureDataObject(id);
  if (!existing) return undefined;
  const update: Record<string, unknown> = { updated_at: db.fn.now() };
  for (const field of DIGITAL_FEATURE_DO_FIELDS) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  const tenDoiTuong = (update.ten_doi_tuong as string | undefined)?.trim();
  if (tenDoiTuong != null) {
    if (!tenDoiTuong) delete update.ten_doi_tuong; // gửi rỗng = giữ tên cũ
    else update.ten_doi_tuong = tenDoiTuong;
  }
  const affected = await db("digital_feature_data_objects").where({ id }).update(update);
  if (!affected) return undefined;
  return getDigitalFeatureDataObject(id);
}

export async function deleteDigitalFeatureDataObject(id: number): Promise<boolean> {
  const affected = await db("digital_feature_data_objects")
    .where({ id, is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return affected > 0;
}

// Xóa nhiều đối tượng đã chọn (checkbox bảng — chỉ admin, chặn ở app.ts).
export async function deleteDigitalFeatureDataObjectList(ids: number[]): Promise<number> {
  const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (validIds.length === 0) return 0;
  const count = await db("digital_feature_data_objects")
    .whereIn("id", validIds)
    .where({ is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return Number(count);
}

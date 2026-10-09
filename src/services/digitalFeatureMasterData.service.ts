import { db } from "../db/database.js";
import type {
  CreateDigitalFeatureMasterDataInput,
  DigitalFeatureMasterData,
  UpdateDigitalFeatureMasterDataInput,
} from "../types/digitalFeature.js";

// Các cột text của bảng digital_feature_master_data — dùng chung cho
// insert/update (service) và whitelist controller.
export const DIGITAL_FEATURE_MD_FIELDS = [
  "ma_danh_muc",
  "ten_danh_muc",
  "noi_dung_thuoc_tinh",
  "quan_tri_boi",
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

export async function getDigitalFeatureMasterData(
  id: number,
): Promise<DigitalFeatureMasterData | undefined> {
  const row = await db("digital_feature_master_data").where({ id, is_deleted: false }).first();
  return (row as DigitalFeatureMasterData) ?? undefined;
}

/** Mã danh mục đang dùng bởi dòng khác của CÙNG module (không tính đã xóa mềm). */
async function isMaDanhMucTaken(
  digitalFeatureId: number,
  maDanhMuc: string,
  excludeId?: number,
): Promise<boolean> {
  const query = db("digital_feature_master_data")
    .where({ digital_feature_id: digitalFeatureId, is_deleted: false })
    .whereRaw("LOWER(LTRIM(RTRIM(ma_danh_muc))) = ?", [maDanhMuc.toLowerCase()]);
  if (excludeId != null) query.andWhereNot({ id: excludeId });
  const row = await query.first();
  return !!row;
}

// Tự sinh Mã "DM-001", "DM-002"... trong phạm vi module (theo id mới nhất
// của module đó +1 — dòng đã xóa mềm vẫn chiếm số, tránh trùng mã cũ).
async function nextMaDanhMuc(digitalFeatureId: number): Promise<string> {
  const row = await db("digital_feature_master_data")
    .where({ digital_feature_id: digitalFeatureId })
    .max({ maxId: "id" })
    .first();
  const next = Number((row as any)?.maxId ?? 0) + 1;
  return `DM-${String(next).padStart(3, "0")}`;
}

export async function listDigitalFeatureMasterData(
  digitalFeatureId: number,
): Promise<DigitalFeatureMasterData[]> {
  const rows = await db("digital_feature_master_data")
    .where({ digital_feature_id: digitalFeatureId, is_deleted: false })
    .select("*")
    .orderBy("id", "asc");
  return rows as DigitalFeatureMasterData[];
}

export async function createDigitalFeatureMasterData(
  input: CreateDigitalFeatureMasterDataInput,
): Promise<DigitalFeatureMasterData> {
  if (!(await featureExists(input.digital_feature_id))) {
    throw new Error("Không tìm thấy tính năng số hoá");
  }
  const tenDanhMuc = input.ten_danh_muc.trim();
  if (!tenDanhMuc) {
    throw new Error("Trường 'ten_danh_muc' là bắt buộc");
  }
  const ma = input.ma_danh_muc?.trim() ? input.ma_danh_muc.trim() : await nextMaDanhMuc(input.digital_feature_id);
  if (await isMaDanhMucTaken(input.digital_feature_id, ma)) {
    throw new Error(`Mã danh mục "${ma}" đã tồn tại trong module — không thêm trùng.`);
  }
  const values: Record<string, unknown> = {
    digital_feature_id: input.digital_feature_id,
    ma_danh_muc: ma,
    ten_danh_muc: tenDanhMuc,
    updated_at: db.fn.now(),
  };
  for (const field of DIGITAL_FEATURE_MD_FIELDS) {
    if (field === "ma_danh_muc" || field === "ten_danh_muc") continue;
    values[field] = cleanText((input as Record<string, unknown>)[field]);
  }
  const [created] = await db("digital_feature_master_data").insert(values).returning("*");
  return created as DigitalFeatureMasterData;
}

export async function updateDigitalFeatureMasterData(
  id: number,
  input: UpdateDigitalFeatureMasterDataInput,
): Promise<DigitalFeatureMasterData | undefined> {
  const existing = await getDigitalFeatureMasterData(id);
  if (!existing) return undefined;
  const update: Record<string, unknown> = { updated_at: db.fn.now() };
  for (const field of DIGITAL_FEATURE_MD_FIELDS) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  const tenDanhMuc = (update.ten_danh_muc as string | undefined)?.trim();
  if (tenDanhMuc != null) {
    if (!tenDanhMuc) delete update.ten_danh_muc; // gửi rỗng = giữ tên cũ
    else update.ten_danh_muc = tenDanhMuc;
  }
  const ma = (update.ma_danh_muc as string | undefined)?.trim();
  if (ma != null) {
    if (!ma) {
      delete update.ma_danh_muc; // mã không tự xóa
    } else if (
      ma.toLowerCase() !== (existing.ma_danh_muc ?? "").toLowerCase() &&
      (await isMaDanhMucTaken(existing.digital_feature_id, ma, id))
    ) {
      throw new Error(`Mã danh mục "${ma}" đã tồn tại ở dòng khác của module — không sửa trùng.`);
    }
  }
  const affected = await db("digital_feature_master_data").where({ id }).update(update);
  if (!affected) return undefined;
  return getDigitalFeatureMasterData(id);
}

export async function deleteDigitalFeatureMasterData(id: number): Promise<boolean> {
  const affected = await db("digital_feature_master_data")
    .where({ id, is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return affected > 0;
}

// Xóa nhiều danh mục đã chọn (checkbox bảng — chỉ admin, chặn ở app.ts).
export async function deleteDigitalFeatureMasterDataList(ids: number[]): Promise<number> {
  const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (validIds.length === 0) return 0;
  const count = await db("digital_feature_master_data")
    .whereIn("id", validIds)
    .where({ is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return Number(count);
}

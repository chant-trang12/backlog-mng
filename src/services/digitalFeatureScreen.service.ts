import { db } from "../db/database.js";
import type {
  CreateDigitalFeatureScreenInput,
  DigitalFeatureScreen,
  UpdateDigitalFeatureScreenInput,
} from "../types/digitalFeature.js";

// Các cột text của bảng digital_feature_screens — dùng chung cho
// insert/update (service) và whitelist controller (trừ digital_feature_id).
export const DIGITAL_FEATURE_SCREEN_FIELDS = [
  "ma_mh",
  "tn",
  "ten_man_hinh",
  "loai",
  "thanh_phan_chinh",
  "hanh_dong",
  "quy_tac_nghiep_vu",
  "sales_am",
  "truong_dvkd",
  "presales_sp",
  "nv_bdkd",
  "ks_lanh_dao_bdkd",
  "phap_che",
  "tckt",
  "ban_lanh_dao",
  "quan_tri_he_thong",
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

export async function getDigitalFeatureScreen(id: number): Promise<DigitalFeatureScreen | undefined> {
  const row = await db("digital_feature_screens").where({ id, is_deleted: false }).first();
  return (row as DigitalFeatureScreen) ?? undefined;
}

/** Mã MH đang dùng bởi dòng khác của CÙNG module (không tính đã xóa mềm). */
async function isMaMhTaken(digitalFeatureId: number, maMh: string, excludeId?: number): Promise<boolean> {
  const query = db("digital_feature_screens")
    .where({ digital_feature_id: digitalFeatureId, is_deleted: false })
    .whereRaw("LOWER(LTRIM(RTRIM(ma_mh))) = ?", [maMh.toLowerCase()]);
  if (excludeId != null) query.andWhereNot({ id: excludeId });
  const row = await query.first();
  return !!row;
}

// Tự sinh Mã MH "MH-001", "MH-002"... trong phạm vi module (theo id mới nhất
// của module đó +1 — dòng đã xóa mềm vẫn chiếm số, tránh trùng mã cũ).
async function nextMaMh(digitalFeatureId: number): Promise<string> {
  const row = await db("digital_feature_screens")
    .where({ digital_feature_id: digitalFeatureId })
    .max({ maxId: "id" })
    .first();
  const next = Number((row as any)?.maxId ?? 0) + 1;
  return `MH-${String(next).padStart(3, "0")}`;
}

export async function listDigitalFeatureScreens(digitalFeatureId: number): Promise<DigitalFeatureScreen[]> {
  const rows = await db("digital_feature_screens")
    .where({ digital_feature_id: digitalFeatureId, is_deleted: false })
    .select("*")
    .orderBy("id", "asc");
  return rows as DigitalFeatureScreen[];
}

export async function createDigitalFeatureScreen(
  input: CreateDigitalFeatureScreenInput,
): Promise<DigitalFeatureScreen> {
  if (!(await featureExists(input.digital_feature_id))) {
    throw new Error("Không tìm thấy tính năng số hoá");
  }
  const tenManHinh = input.ten_man_hinh.trim();
  if (!tenManHinh) {
    throw new Error("Trường 'ten_man_hinh' là bắt buộc");
  }
  const maMh = input.ma_mh?.trim() ? input.ma_mh.trim() : await nextMaMh(input.digital_feature_id);
  if (await isMaMhTaken(input.digital_feature_id, maMh)) {
    throw new Error(`Mã MH "${maMh}" đã tồn tại trong module — không thêm trùng.`);
  }
  const values: Record<string, unknown> = {
    digital_feature_id: input.digital_feature_id,
    ma_mh: maMh,
    ten_man_hinh: tenManHinh,
    updated_at: db.fn.now(),
  };
  for (const field of DIGITAL_FEATURE_SCREEN_FIELDS) {
    if (field === "ma_mh" || field === "ten_man_hinh") continue;
    values[field] = cleanText((input as Record<string, unknown>)[field]);
  }
  const [created] = await db("digital_feature_screens").insert(values).returning("*");
  return created as DigitalFeatureScreen;
}

export async function updateDigitalFeatureScreen(
  id: number,
  input: UpdateDigitalFeatureScreenInput,
): Promise<DigitalFeatureScreen | undefined> {
  const existing = await getDigitalFeatureScreen(id);
  if (!existing) return undefined;
  const update: Record<string, unknown> = { updated_at: db.fn.now() };
  for (const field of DIGITAL_FEATURE_SCREEN_FIELDS) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  const tenManHinh = (update.ten_man_hinh as string | undefined)?.trim();
  if (tenManHinh != null) {
    if (!tenManHinh) delete update.ten_man_hinh; // gửi rỗng = giữ tên cũ
    else update.ten_man_hinh = tenManHinh;
  }
  const maMh = (update.ma_mh as string | undefined)?.trim();
  if (maMh != null) {
    if (!maMh) {
      delete update.ma_mh; // mã không tự xóa
    } else if (maMh.toLowerCase() !== (existing.ma_mh ?? "").toLowerCase() && (await isMaMhTaken(existing.digital_feature_id, maMh, id))) {
      throw new Error(`Mã MH "${maMh}" đã tồn tại ở dòng khác của module — không sửa trùng.`);
    }
  }
  const affected = await db("digital_feature_screens").where({ id }).update(update);
  if (!affected) return undefined;
  return getDigitalFeatureScreen(id);
}

export async function deleteDigitalFeatureScreen(id: number): Promise<boolean> {
  const affected = await db("digital_feature_screens")
    .where({ id, is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return affected > 0;
}

// Xóa nhiều màn hình đã chọn (checkbox bảng — chỉ admin, chặn ở app.ts).
export async function deleteDigitalFeatureScreens(ids: number[]): Promise<number> {
  const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (validIds.length === 0) return 0;
  const count = await db("digital_feature_screens")
    .whereIn("id", validIds)
    .where({ is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return Number(count);
}

import { db } from "../db/database.js";
import type {
  CreateDigitalFeatureInput,
  DigitalFeature,
  DigitalFeatureFilters,
  UpdateDigitalFeatureInput,
} from "../types/digitalFeature.js";

// Các cột text của bảng digital_features — dùng chung cho insert/update
// (service) và whitelist controller.
export const DIGITAL_FEATURE_FIELDS = [
  "ma",
  "module",
  "don_vi_chu_tri",
  "don_vi_phoi_hop",
  "giai_doan",
  "tn_mh",
  "muc_tieu_nghiep_vu",
  "vai_tro_pbdkd",
  "nhan_dau_vao_tu",
  "chuyen_dau_ra_toi",
] as const;

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export async function getDigitalFeature(id: number): Promise<DigitalFeature | undefined> {
  const row = await db("digital_features").where({ id, is_deleted: false }).first();
  return (row as DigitalFeature) ?? undefined;
}

/** Mã đang được dùng bởi dòng khác ĐANG HIỂN THỊ (không tính dòng đã xóa mềm). */
async function isMaTaken(ma: string, excludeId?: number): Promise<boolean> {
  const query = db("digital_features")
    .where({ is_deleted: false })
    .whereRaw("LOWER(LTRIM(RTRIM(ma))) = ?", [ma.toLowerCase()]);
  if (excludeId != null) query.andWhereNot({ id: excludeId });
  const row = await query.first();
  return !!row;
}

// Tự sinh Mã "TNSH-001", "TNSH-002"... — theo id mới nhất +1 (dòng đã xóa
// mềm vẫn chiếm số, tránh trùng mã với dòng cũ đã bị xóa nhưng còn trong DB).
async function nextMa(): Promise<string> {
  const row = await db("digital_features").max({ maxId: "id" }).first();
  const next = Number((row as any)?.maxId ?? 0) + 1;
  return `TNSH-${String(next).padStart(3, "0")}`;
}

export async function listDigitalFeatures(filters: DigitalFeatureFilters = {}): Promise<DigitalFeature[]> {
  const query = db("digital_features").where({ is_deleted: false }).select("*").orderBy("id", "asc");
  const search = filters.search?.trim();
  if (search) {
    // Tìm từ khóa trên toàn bộ cột text — giống ô Tìm kiếm ở các bảng khác.
    const like = `%${search.toLowerCase()}%`;
    query.andWhere((qb) => {
      for (const col of DIGITAL_FEATURE_FIELDS) {
        qb.orWhereRaw(`LOWER(COALESCE(${col}, '')) LIKE ?`, [like]);
      }
    });
  }
  if (filters.module?.trim()) query.andWhereRaw("LOWER(module) = ?", [filters.module.trim().toLowerCase()]);
  if (filters.giai_doan?.trim()) query.andWhereRaw("LOWER(giai_doan) = ?", [filters.giai_doan.trim().toLowerCase()]);
  if (filters.tn_mh?.trim()) query.andWhereRaw("LOWER(tn_mh) = ?", [filters.tn_mh.trim().toLowerCase()]);
  if (filters.don_vi_chu_tri?.trim()) {
    query.andWhereRaw("LOWER(don_vi_chu_tri) = ?", [filters.don_vi_chu_tri.trim().toLowerCase()]);
  }
  return (await query) as DigitalFeature[];
}

export async function createDigitalFeature(input: CreateDigitalFeatureInput): Promise<DigitalFeature> {
  const ma = input.ma?.trim() ? input.ma.trim() : await nextMa();
  if (await isMaTaken(ma)) {
    throw new Error(`Mã "${ma}" đã tồn tại trong danh sách — không thêm trùng.`);
  }
  const [created] = await db("digital_features")
    .insert({
      ma,
      module: input.module.trim(),
      don_vi_chu_tri: input.don_vi_chu_tri ?? null,
      don_vi_phoi_hop: input.don_vi_phoi_hop ?? null,
      giai_doan: input.giai_doan ?? null,
      tn_mh: input.tn_mh ?? null,
      muc_tieu_nghiep_vu: input.muc_tieu_nghiep_vu ?? null,
      vai_tro_pbdkd: input.vai_tro_pbdkd ?? null,
      nhan_dau_vao_tu: input.nhan_dau_vao_tu ?? null,
      chuyen_dau_ra_toi: input.chuyen_dau_ra_toi ?? null,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return created as DigitalFeature;
}

export async function updateDigitalFeature(
  id: number,
  input: UpdateDigitalFeatureInput,
): Promise<DigitalFeature | undefined> {
  const existing = await getDigitalFeature(id);
  if (!existing) return undefined;
  const update: Record<string, unknown> = { updated_at: db.fn.now() };
  for (const field of DIGITAL_FEATURE_FIELDS) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  const ma = (update.ma as string | undefined)?.trim();
  if (ma != null) {
    if (!ma) {
      delete update.ma; // gửi rỗng = giữ nguyên mã cũ (mã không tự xóa)
    } else if (ma.toLowerCase() !== (existing.ma ?? "").toLowerCase() && (await isMaTaken(ma, id))) {
      throw new Error(`Mã "${ma}" đã tồn tại ở dòng khác — không sửa trùng.`);
    }
  }
  if (update.module != null) update.module = String(update.module).trim();
  const affected = await db("digital_features").where({ id }).update(update);
  if (!affected) return undefined;
  return getDigitalFeature(id);
}

export async function deleteDigitalFeature(id: number): Promise<boolean> {
  const affected = await db("digital_features")
    .where({ id, is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return affected > 0;
}

// Xóa nhiều tính năng theo checkbox đã chọn trên bảng (chỉ admin — chặn ở
// route qua requireAdmin, xem app.ts). Digital features dùng chung toàn hệ
// thống nên không cần lọc phạm vi phòng ban như deleteFeatureRequests().
export async function deleteDigitalFeatures(ids: number[]): Promise<number> {
  const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (validIds.length === 0) return 0;
  const count = await db("digital_features")
    .whereIn("id", validIds)
    .where({ is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return Number(count);
}

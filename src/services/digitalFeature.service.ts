import { db } from "../db/database.js";
import type {
  CreateDigitalFeatureInput,
  DigitalFeature,
  DigitalFeatureFilters,
  UpdateDigitalFeatureInput,
} from "../types/digitalFeature.js";
import { isDigitalFeatureInScope, type DataScope } from "./scope.util.js";

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

export async function getCoopDepartmentIds(featureId: number): Promise<number[]> {
  const rows = await db("digital_feature_coop_departments").where({ digital_feature_id: featureId }).select("department_id");
  return rows.map((r: any) => Number(r.department_id));
}

// Đồng bộ danh sách phòng phối hợp = departmentIds (xoá bản ghi không còn,
// thêm bản ghi mới) — đơn giản hơn so sánh diff, bảng nối nhỏ nên chấp
// nhận được. undefined ở input (client không gửi field) nghĩa là "không
// đổi", KHÔNG gọi hàm này — phân biệt với mảng rỗng [] ("gỡ hết phòng phối
// hợp"), xem createDigitalFeature/updateDigitalFeature bên dưới.
async function setCoopDepartments(featureId: number, departmentIds: number[]): Promise<void> {
  const validIds = [...new Set(departmentIds.filter((id) => Number.isInteger(id) && id > 0))];
  await db("digital_feature_coop_departments").where({ digital_feature_id: featureId }).del();
  if (validIds.length === 0) return;
  await db("digital_feature_coop_departments").insert(
    validIds.map((department_id) => ({ digital_feature_id: featureId, department_id })),
  );
}

// Gắn coop_department_ids cho 1 danh sách tính năng đã có (1 query duy
// nhất, tránh N+1) — dùng ở listDigitalFeatures().
async function attachCoopDepartmentIds(rows: DigitalFeature[]): Promise<DigitalFeature[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const links = await db("digital_feature_coop_departments")
    .whereIn("digital_feature_id", ids)
    .select("digital_feature_id", "department_id");
  const byFeature = new Map<number, number[]>();
  for (const link of links as any[]) {
    const fid = Number(link.digital_feature_id);
    const arr = byFeature.get(fid) ?? [];
    arr.push(Number(link.department_id));
    byFeature.set(fid, arr);
  }
  return rows.map((r) => ({ ...r, coop_department_ids: byFeature.get(r.id) ?? [] }));
}

export async function getDigitalFeature(id: number): Promise<DigitalFeature | undefined> {
  const row = await db("digital_features").where({ id, is_deleted: false }).first();
  if (!row) return undefined;
  const coop_department_ids = await getCoopDepartmentIds(id);
  return { ...(row as DigitalFeature), coop_department_ids };
}

// Dùng ở các controller tab con (Màn hình/Danh mục/Đối tượng dữ liệu/Tích
// hợp — nhận digital_feature_id qua path "/digital-features/:id/...") để
// chặn IDOR: đoán ID tính năng của phòng khác rồi liệt kê/import/export/
// thêm dữ liệu con vào đó. false khi tính năng không tồn tại hoặc ngoài
// phạm vi phòng ban (Quy tắc 9.2).
export async function isDigitalFeatureIdInScope(scope: DataScope, featureId: number): Promise<boolean> {
  const feature = await getDigitalFeature(featureId);
  if (!feature) return false;
  return isDigitalFeatureInScope(scope, feature.department_id, feature.coop_department_ids);
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

// departmentId: null = không lọc (scope.all, gọi từ listDigitalFeaturesHandler
// khi req.dataScope.all=true, hoặc gọi nội bộ — VD check trùng Mã/Module lúc
// import — cần thấy TOÀN BỘ bất kể phòng ban). Khi có giá trị: chỉ trả dòng
// department_id = đúng phòng đó, HOẶC department_id NULL (dữ liệu cũ, dùng
// chung), HOẶC đang có mặt trong digital_feature_coop_departments ("Đơn vị
// phối hợp" dạng phòng ban thật) — xem comment isDigitalFeatureInScope() ở
// scope.util.ts.
export async function listDigitalFeatures(
  filters: DigitalFeatureFilters = {},
  departmentId: number | null = null,
): Promise<DigitalFeature[]> {
  const query = db("digital_features").where({ is_deleted: false }).select("*").orderBy("id", "asc");
  if (departmentId != null) {
    query.andWhere((qb) => {
      qb.whereNull("department_id")
        .orWhere("department_id", departmentId)
        .orWhereExists(
          db("digital_feature_coop_departments")
            .whereRaw("digital_feature_coop_departments.digital_feature_id = digital_features.id")
            .andWhere("digital_feature_coop_departments.department_id", departmentId),
        );
    });
  }
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
  const rows = (await query) as DigitalFeature[];
  return attachCoopDepartmentIds(rows);
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
      department_id: input.department_id ?? null,
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
  if (input.coop_department_ids !== undefined) {
    await setCoopDepartments(created.id, input.coop_department_ids);
  }
  return (await getDigitalFeature(created.id)) as DigitalFeature;
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
  if (input.coop_department_ids !== undefined) {
    await setCoopDepartments(id, input.coop_department_ids);
  }
  return getDigitalFeature(id);
}

export async function deleteDigitalFeature(id: number): Promise<boolean> {
  const affected = await db("digital_features")
    .where({ id, is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return affected > 0;
}

// Xóa nhiều tính năng theo checkbox đã chọn trên bảng (admin/subadmin —
// chặn ở route qua requireAdminOrSubAdmin, xem app.ts). departmentId: null =
// không lọc (scope.all); có giá trị thì chỉ xóa được dòng thuộc đúng phòng
// đó, dòng department_id NULL (dữ liệu cũ, dùng chung), hoặc dòng đang có
// phòng này ở "Đơn vị phối hợp" — subadmin bị giới hạn phòng ban không xóa
// được dòng ngoài phạm vi (Quy tắc 9.2, cùng logic isDigitalFeatureInScope()).
export async function deleteDigitalFeatures(ids: number[], departmentId: number | null = null): Promise<number> {
  const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (validIds.length === 0) return 0;
  const query = db("digital_features").whereIn("id", validIds).where({ is_deleted: false });
  if (departmentId != null) {
    query.andWhere((qb) => {
      qb.whereNull("department_id")
        .orWhere("department_id", departmentId)
        .orWhereExists(
          db("digital_feature_coop_departments")
            .whereRaw("digital_feature_coop_departments.digital_feature_id = digital_features.id")
            .andWhere("digital_feature_coop_departments.department_id", departmentId),
        );
    });
  }
  const count = await query.update({ is_deleted: true, deleted_at: db.fn.now() });
  return Number(count);
}

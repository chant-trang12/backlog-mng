import { db } from "../db/database.js";
import type { DanhGiaRecord, DanhGiaRecordWithDetails, UpsertDanhGiaEntry } from "../types/cskh.js";
import { assertDepartmentInScope, departmentIdFromMemberId, type DataScope } from "./scope.util.js";

export async function getDanhGiaRecord(id: number): Promise<DanhGiaRecord | undefined> {
  const row = await db("danh_gia_records").where({ id }).first();
  return row as DanhGiaRecord | undefined;
}

// Danh sách bản ghi Đánh giá của 1 tháng theo dõi (period_id), kèm tên nhân
// sự / team / nhãn tháng — hiển thị dạng bảng Tháng theo dõi / Team / Nhân
// sự / Số thứ tự.
export async function listDanhGiaRecords(
  periodId: number,
  departmentId?: number | null,
): Promise<DanhGiaRecordWithDetails[]> {
  const query = db("danh_gia_records")
    .join("members", "members.id", "danh_gia_records.member_id")
    .join("teams", "teams.id", "members.team_id")
    .join("periods", "periods.id", "danh_gia_records.period_id")
    .where("danh_gia_records.period_id", periodId)
    .select(
      "danh_gia_records.*",
      "members.name as member_name",
      "members.team_id as team_id",
      "teams.name as team_name",
      "periods.label as period_label",
    );
  if (departmentId != null) query.where("danh_gia_records.department_id", departmentId);
  const rows = await query.orderBy("teams.name", "asc").orderBy("danh_gia_records.so_thu_tu", "asc");

  return rows as DanhGiaRecordWithDetails[];
}

// "+ Thêm Đánh giá" — thêm/cập nhật Số thứ tự cho nhiều nhân sự của 1 team
// cùng lúc. 1 nhân sự chỉ có đúng 1 bản ghi/tháng theo dõi (UNIQUE
// period_id + member_id) — gọi lại cho nhân sự đã có bản ghi sẽ cập nhật,
// không tạo trùng.
export async function upsertDanhGiaRecords(
  periodId: number,
  entries: UpsertDanhGiaEntry[],
  scope: DataScope,
): Promise<void> {
  // Tính department_id + kiểm tra phạm vi TRƯỚC khi mở transaction — gọi
  // db(...) ngoài trx trong lúc trx đang mở sẽ tự deadlock trên SQLite
  // (transaction giữ khóa duy nhất của connection, còn query ngoài trx phải
  // đợi khóa đó nhả ra).
  const departmentIdByMember = new Map<number, number | null>();
  for (const entry of entries) {
    const departmentId = await departmentIdFromMemberId(entry.member_id);
    assertDepartmentInScope(scope, departmentId);
    departmentIdByMember.set(entry.member_id, departmentId);
  }

  await db.transaction(async (trx) => {
    for (const entry of entries) {
      const departmentId = departmentIdByMember.get(entry.member_id) ?? null;
      const existing = await trx("danh_gia_records")
        .where({ period_id: periodId, member_id: entry.member_id })
        .first();

      if (existing) {
        assertDepartmentInScope(scope, (existing as any).department_id ?? null);
        await trx("danh_gia_records")
          .where({ id: existing.id })
          .update({
            so_thu_tu: entry.so_thu_tu,
            updated_at: db.fn.now(),
          });
      } else {
        await trx("danh_gia_records").insert({
          period_id: periodId,
          member_id: entry.member_id,
          department_id: departmentId,
          so_thu_tu: entry.so_thu_tu,
        });
      }
    }
  });
}

export async function updateDanhGiaRecord(
  id: number,
  soThuTu: number,
  scope: DataScope,
): Promise<DanhGiaRecord | undefined> {
  const existing = await getDanhGiaRecord(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);

  const [updated] = await db("danh_gia_records")
    .where({ id })
    .update({
      so_thu_tu: soThuTu,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as DanhGiaRecord;
}

export async function deleteDanhGiaRecord(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getDanhGiaRecord(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);
  const count = await db("danh_gia_records").where({ id }).delete();
  return count > 0;
}

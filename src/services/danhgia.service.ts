import { db } from "../db/database.js";
import type { DanhGiaRecord, DanhGiaRecordWithDetails, UpsertDanhGiaEntry } from "../types/cskh.js";

export async function getDanhGiaRecord(id: number): Promise<DanhGiaRecord | undefined> {
  const row = await db("danh_gia_records").where({ id }).first();
  return row as DanhGiaRecord | undefined;
}

// Danh sách bản ghi Đánh giá của 1 tháng theo dõi (period_id), kèm tên nhân
// sự / team / nhãn tháng — hiển thị dạng bảng Tháng theo dõi / Team / Nhân
// sự / Số thứ tự.
export async function listDanhGiaRecords(periodId: number): Promise<DanhGiaRecordWithDetails[]> {
  const rows = await db("danh_gia_records")
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
    )
    .orderBy("teams.name", "asc")
    .orderBy("danh_gia_records.so_thu_tu", "asc");

  return rows as DanhGiaRecordWithDetails[];
}

// "+ Thêm Đánh giá" — thêm/cập nhật Số thứ tự cho nhiều nhân sự của 1 team
// cùng lúc. 1 nhân sự chỉ có đúng 1 bản ghi/tháng theo dõi (UNIQUE
// period_id + member_id) — gọi lại cho nhân sự đã có bản ghi sẽ cập nhật,
// không tạo trùng.
export async function upsertDanhGiaRecords(periodId: number, entries: UpsertDanhGiaEntry[]): Promise<void> {
  await db.transaction(async (trx) => {
    for (const entry of entries) {
      const existing = await trx("danh_gia_records")
        .where({ period_id: periodId, member_id: entry.member_id })
        .first();

      if (existing) {
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
          so_thu_tu: entry.so_thu_tu,
        });
      }
    }
  });
}

export async function updateDanhGiaRecord(id: number, soThuTu: number): Promise<DanhGiaRecord | undefined> {
  const existing = await getDanhGiaRecord(id);
  if (!existing) return undefined;

  const [updated] = await db("danh_gia_records")
    .where({ id })
    .update({
      so_thu_tu: soThuTu,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as DanhGiaRecord;
}

export async function deleteDanhGiaRecord(id: number): Promise<boolean> {
  const count = await db("danh_gia_records").where({ id }).delete();
  return count > 0;
}

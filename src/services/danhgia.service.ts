import { db } from "../db/database.js";
import type { DanhGiaRecord, DanhGiaRecordWithDetails, UpsertDanhGiaEntry } from "../types/cskh.js";

export function getDanhGiaRecord(id: number): DanhGiaRecord | undefined {
  return db.prepare(`SELECT * FROM danh_gia_records WHERE id = ?`).get(id) as DanhGiaRecord | undefined;
}

// Danh sách bản ghi Đánh giá của 1 tháng theo dõi (period_id), kèm tên nhân
// sự / team / nhãn tháng — hiển thị dạng bảng Tháng theo dõi / Team / Nhân
// sự / Số thứ tự.
export function listDanhGiaRecords(periodId: number): DanhGiaRecordWithDetails[] {
  return db
    .prepare(
      `SELECT danh_gia_records.*, members.name AS member_name, members.team_id AS team_id,
              teams.name AS team_name, periods.label AS period_label
       FROM danh_gia_records
       JOIN members ON members.id = danh_gia_records.member_id
       JOIN teams ON teams.id = members.team_id
       JOIN periods ON periods.id = danh_gia_records.period_id
       WHERE danh_gia_records.period_id = ?
       ORDER BY teams.name ASC, danh_gia_records.so_thu_tu ASC`,
    )
    .all(periodId) as DanhGiaRecordWithDetails[];
}

// "+ Thêm Đánh giá" — thêm/cập nhật Số thứ tự cho nhiều nhân sự của 1 team
// cùng lúc. 1 nhân sự chỉ có đúng 1 bản ghi/tháng theo dõi (UNIQUE
// period_id + member_id) — gọi lại cho nhân sự đã có bản ghi sẽ cập nhật,
// không tạo trùng.
export function upsertDanhGiaRecords(periodId: number, entries: UpsertDanhGiaEntry[]): void {
  const upsert = db.prepare(
    `INSERT INTO danh_gia_records (period_id, member_id, so_thu_tu)
     VALUES (?, ?, ?)
     ON CONFLICT(period_id, member_id) DO UPDATE SET so_thu_tu = excluded.so_thu_tu, updated_at = datetime('now')`,
  );
  const tx = db.transaction((items: UpsertDanhGiaEntry[]) => {
    items.forEach((entry) => upsert.run(periodId, entry.member_id, entry.so_thu_tu));
  });
  tx(entries);
}

export function updateDanhGiaRecord(id: number, soThuTu: number): DanhGiaRecord | undefined {
  const existing = getDanhGiaRecord(id);
  if (!existing) return undefined;

  return db
    .prepare(`UPDATE danh_gia_records SET so_thu_tu = ?, updated_at = datetime('now') WHERE id = ? RETURNING *`)
    .get(soThuTu, id) as DanhGiaRecord;
}

export function deleteDanhGiaRecord(id: number): boolean {
  const result = db.prepare(`DELETE FROM danh_gia_records WHERE id = ?`).run(id);
  return result.changes > 0;
}

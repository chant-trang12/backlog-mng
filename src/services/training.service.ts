import { db } from "../db/database.js";
import type {
  CreateTrainingRecordInput,
  TrainingRecord,
  TrainingRecordWithDetails,
  UpdateTrainingRecordInput,
} from "../types/cskh.js";

export function createTrainingRecord(input: CreateTrainingRecordInput): TrainingRecord {
  return db
    .prepare(
      `INSERT INTO training_records (period_id, member_id, loai, ngay_thuc_hien, nguoi_xac_nhan, noi_dung)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.period_id,
      input.member_id,
      input.loai?.trim() || null,
      input.ngay_thuc_hien?.trim() || null,
      input.nguoi_xac_nhan?.trim() || null,
      input.noi_dung?.trim() || null,
    ) as TrainingRecord;
}

export function getTrainingRecord(id: number): TrainingRecord | undefined {
  return db.prepare(`SELECT * FROM training_records WHERE id = ?`).get(id) as
    | TrainingRecord
    | undefined;
}

// Danh sách bản ghi Đào tạo của 1 tháng theo dõi (period_id), kèm tên nhân sự
// / team / nhãn tháng — hiển thị dạng bảng Tháng theo dõi / Team / Nhân sự /
// Loại / Ngày thực hiện / Người xác nhận / Nội dung. Lọc theo tháng đang chọn
// ở Bộ lọc, giống bảng Nhân sự.
export function listTrainingRecords(periodId: number): TrainingRecordWithDetails[] {
  return db
    .prepare(
      `SELECT training_records.*, members.name AS member_name, members.team_id AS team_id,
              teams.name AS team_name, periods.label AS period_label
       FROM training_records
       JOIN members ON members.id = training_records.member_id
       JOIN teams ON teams.id = members.team_id
       JOIN periods ON periods.id = training_records.period_id
       WHERE training_records.period_id = ?
       ORDER BY teams.name ASC, training_records.id DESC`,
    )
    .all(periodId) as TrainingRecordWithDetails[];
}

export function updateTrainingRecord(
  id: number,
  input: UpdateTrainingRecordInput,
): TrainingRecord | undefined {
  const existing = getTrainingRecord(id);
  if (!existing) return undefined;

  const merged = {
    member_id: input.member_id ?? existing.member_id,
    loai: input.loai !== undefined ? input.loai.trim() || null : existing.loai,
    ngay_thuc_hien:
      input.ngay_thuc_hien !== undefined ? input.ngay_thuc_hien.trim() || null : existing.ngay_thuc_hien,
    nguoi_xac_nhan:
      input.nguoi_xac_nhan !== undefined ? input.nguoi_xac_nhan.trim() || null : existing.nguoi_xac_nhan,
    noi_dung: input.noi_dung !== undefined ? input.noi_dung.trim() || null : existing.noi_dung,
  };

  return db
    .prepare(
      `UPDATE training_records
       SET member_id = ?, loai = ?, ngay_thuc_hien = ?, nguoi_xac_nhan = ?, noi_dung = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .get(
      merged.member_id,
      merged.loai,
      merged.ngay_thuc_hien,
      merged.nguoi_xac_nhan,
      merged.noi_dung,
      id,
    ) as TrainingRecord;
}

export function deleteTrainingRecord(id: number): boolean {
  const result = db.prepare(`DELETE FROM training_records WHERE id = ?`).run(id);
  return result.changes > 0;
}

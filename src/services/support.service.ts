import { db } from "../db/database.js";
import type {
  CreateSupportRecordInput,
  SupportRecord,
  SupportRecordWithDetails,
  UpdateSupportRecordInput,
} from "../types/cskh.js";

export function createSupportRecord(input: CreateSupportRecordInput): SupportRecord {
  return db
    .prepare(
      `INSERT INTO support_records (period_id, member_id, team_nhan_ho_tro_id, noi_dung, ngay_ho_tro, nguoi_xac_nhan)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.period_id,
      input.member_id,
      input.team_nhan_ho_tro_id,
      input.noi_dung?.trim() || null,
      input.ngay_ho_tro?.trim() || null,
      input.nguoi_xac_nhan?.trim() || null,
    ) as SupportRecord;
}

export function getSupportRecord(id: number): SupportRecord | undefined {
  return db.prepare(`SELECT * FROM support_records WHERE id = ?`).get(id) as SupportRecord | undefined;
}

// Danh sách bản ghi Hỗ trợ của 1 tháng theo dõi (period_id), kèm tên nhân sự
// / team thực hiện hỗ trợ (team của nhân sự) / team nhận hỗ trợ / nhãn tháng
// — hiển thị dạng bảng Tháng theo dõi / Team thực hiện hỗ trợ / Nhân sự /
// Team nhận hỗ trợ / Nội dung / Ngày hỗ trợ / Người xác nhận.
export function listSupportRecords(periodId: number): SupportRecordWithDetails[] {
  return db
    .prepare(
      `SELECT support_records.*, members.name AS member_name, members.team_id AS team_id,
              teams.name AS team_name, teams_nhan.name AS team_nhan_ho_tro_name,
              periods.label AS period_label
       FROM support_records
       JOIN members ON members.id = support_records.member_id
       JOIN teams ON teams.id = members.team_id
       JOIN teams AS teams_nhan ON teams_nhan.id = support_records.team_nhan_ho_tro_id
       JOIN periods ON periods.id = support_records.period_id
       WHERE support_records.period_id = ?
       ORDER BY teams.name ASC, support_records.id DESC`,
    )
    .all(periodId) as SupportRecordWithDetails[];
}

export function updateSupportRecord(
  id: number,
  input: UpdateSupportRecordInput,
): SupportRecord | undefined {
  const existing = getSupportRecord(id);
  if (!existing) return undefined;

  const merged = {
    member_id: input.member_id ?? existing.member_id,
    team_nhan_ho_tro_id: input.team_nhan_ho_tro_id ?? existing.team_nhan_ho_tro_id,
    noi_dung: input.noi_dung !== undefined ? input.noi_dung.trim() || null : existing.noi_dung,
    ngay_ho_tro: input.ngay_ho_tro !== undefined ? input.ngay_ho_tro.trim() || null : existing.ngay_ho_tro,
    nguoi_xac_nhan:
      input.nguoi_xac_nhan !== undefined ? input.nguoi_xac_nhan.trim() || null : existing.nguoi_xac_nhan,
  };

  return db
    .prepare(
      `UPDATE support_records
       SET member_id = ?, team_nhan_ho_tro_id = ?, noi_dung = ?, ngay_ho_tro = ?, nguoi_xac_nhan = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .get(
      merged.member_id,
      merged.team_nhan_ho_tro_id,
      merged.noi_dung,
      merged.ngay_ho_tro,
      merged.nguoi_xac_nhan,
      id,
    ) as SupportRecord;
}

export function deleteSupportRecord(id: number): boolean {
  const result = db.prepare(`DELETE FROM support_records WHERE id = ?`).run(id);
  return result.changes > 0;
}

import { db } from "../db/database.js";
import type {
  ComplianceRecord,
  ComplianceRecordWithDetails,
  CreateComplianceRecordInput,
  UpdateComplianceRecordInput,
} from "../types/cskh.js";

export function createComplianceRecord(input: CreateComplianceRecordInput): ComplianceRecord {
  return db
    .prepare(
      `INSERT INTO compliance_records (period_id, member_id, vi_pham, noi_dung) VALUES (?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.period_id,
      input.member_id,
      input.vi_pham ?? 0,
      input.noi_dung?.trim() || null,
    ) as ComplianceRecord;
}

export function getComplianceRecord(id: number): ComplianceRecord | undefined {
  return db.prepare(`SELECT * FROM compliance_records WHERE id = ?`).get(id) as
    | ComplianceRecord
    | undefined;
}

// Danh sách bản ghi Tuân thủ của 1 tháng theo dõi (period_id), kèm tên nhân
// sự / team / nhãn tháng — hiển thị dạng bảng Tháng theo dõi / Team / Nhân sự
// / Vi phạm / Nội dung. Lọc theo tháng đang chọn ở Bộ lọc, giống bảng Nhân sự.
export function listComplianceRecords(periodId: number): ComplianceRecordWithDetails[] {
  return db
    .prepare(
      `SELECT compliance_records.*, members.name AS member_name, members.team_id AS team_id,
              teams.name AS team_name, periods.label AS period_label
       FROM compliance_records
       JOIN members ON members.id = compliance_records.member_id
       JOIN teams ON teams.id = members.team_id
       JOIN periods ON periods.id = compliance_records.period_id
       WHERE compliance_records.period_id = ?
       ORDER BY teams.name ASC, compliance_records.id DESC`,
    )
    .all(periodId) as ComplianceRecordWithDetails[];
}

export function updateComplianceRecord(
  id: number,
  input: UpdateComplianceRecordInput,
): ComplianceRecord | undefined {
  const existing = getComplianceRecord(id);
  if (!existing) return undefined;

  const merged = {
    member_id: input.member_id ?? existing.member_id,
    vi_pham: input.vi_pham ?? existing.vi_pham,
    noi_dung: input.noi_dung !== undefined ? input.noi_dung.trim() || null : existing.noi_dung,
  };

  return db
    .prepare(
      `UPDATE compliance_records SET member_id = ?, vi_pham = ?, noi_dung = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .get(merged.member_id, merged.vi_pham, merged.noi_dung, id) as ComplianceRecord;
}

export function deleteComplianceRecord(id: number): boolean {
  const result = db.prepare(`DELETE FROM compliance_records WHERE id = ?`).run(id);
  return result.changes > 0;
}

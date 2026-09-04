import { db } from "../db/database.js";
import type {
  CreateSupportRecordInput,
  SupportRecord,
  SupportRecordWithDetails,
  UpdateSupportRecordInput,
} from "../types/cskh.js";

export async function createSupportRecord(input: CreateSupportRecordInput): Promise<SupportRecord> {
  const [created] = await db("support_records")
    .insert({
      period_id: input.period_id,
      member_id: input.member_id,
      team_nhan_ho_tro_id: input.team_nhan_ho_tro_id,
      noi_dung: input.noi_dung?.trim() || null,
      ngay_ho_tro: input.ngay_ho_tro?.trim() || null,
      nguoi_xac_nhan: input.nguoi_xac_nhan?.trim() || null,
    })
    .returning("*");

  return created as SupportRecord;
}

export async function getSupportRecord(id: number): Promise<SupportRecord | undefined> {
  const row = await db("support_records").where({ id }).first();
  return row as SupportRecord | undefined;
}

// Danh sách bản ghi Hỗ trợ của 1 tháng theo dõi (period_id), kèm tên nhân sự
// / team thực hiện hỗ trợ (team của nhân sự) / team nhận hỗ trợ / nhãn tháng
// — hiển thị dạng bảng Tháng theo dõi / Team thực hiện hỗ trợ / Nhân sự /
// Team nhận hỗ trợ / Nội dung / Ngày hỗ trợ / Người xác nhận.
export async function listSupportRecords(periodId: number): Promise<SupportRecordWithDetails[]> {
  const rows = await db("support_records")
    .join("members", "members.id", "support_records.member_id")
    .join("teams", "teams.id", "members.team_id")
    .join("teams as teams_nhan", "teams_nhan.id", "support_records.team_nhan_ho_tro_id")
    .join("periods", "periods.id", "support_records.period_id")
    .where("support_records.period_id", periodId)
    .select(
      "support_records.*",
      "members.name as member_name",
      "members.team_id as team_id",
      "teams.name as team_name",
      "teams_nhan.name as team_nhan_ho_tro_name",
      "periods.label as period_label",
    )
    .orderBy("teams.name", "asc")
    .orderBy("support_records.id", "desc");

  return rows as SupportRecordWithDetails[];
}

export async function updateSupportRecord(
  id: number,
  input: UpdateSupportRecordInput,
): Promise<SupportRecord | undefined> {
  const existing = await getSupportRecord(id);
  if (!existing) return undefined;

  const merged = {
    member_id: input.member_id ?? existing.member_id,
    team_nhan_ho_tro_id: input.team_nhan_ho_tro_id ?? existing.team_nhan_ho_tro_id,
    noi_dung: input.noi_dung !== undefined ? input.noi_dung.trim() || null : existing.noi_dung,
    ngay_ho_tro: input.ngay_ho_tro !== undefined ? input.ngay_ho_tro.trim() || null : existing.ngay_ho_tro,
    nguoi_xac_nhan:
      input.nguoi_xac_nhan !== undefined ? input.nguoi_xac_nhan.trim() || null : existing.nguoi_xac_nhan,
  };

  const [updated] = await db("support_records")
    .where({ id })
    .update({
      ...merged,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as SupportRecord;
}

export async function deleteSupportRecord(id: number): Promise<boolean> {
  const count = await db("support_records").where({ id }).delete();
  return count > 0;
}

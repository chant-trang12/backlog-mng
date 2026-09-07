import { db } from "../db/database.js";
import type {
  CreateTrainingRecordInput,
  TrainingRecord,
  TrainingRecordWithDetails,
  UpdateTrainingRecordInput,
} from "../types/cskh.js";

export async function createTrainingRecord(input: CreateTrainingRecordInput): Promise<TrainingRecord> {
  const [created] = await db("training_records")
    .insert({
      period_id: input.period_id,
      member_id: input.member_id,
      loai: input.loai?.trim() || null,
      ngay_thuc_hien: input.ngay_thuc_hien?.trim() || null,
      nguoi_xac_nhan: input.nguoi_xac_nhan?.trim() || null,
      noi_dung: input.noi_dung?.trim() || null,
    })
    .returning("*");
  return created as TrainingRecord;
}

export async function getTrainingRecord(id: number): Promise<TrainingRecord | undefined> {
  const row = await db("training_records").where({ id }).first();
  return row as TrainingRecord | undefined;
}

// Danh sách bản ghi Đào tạo của 1 tháng theo dõi (period_id), kèm tên nhân sự
// / team / nhãn tháng — hiển thị dạng bảng Tháng theo dõi / Team / Nhân sự /
// Loại / Ngày thực hiện / Người xác nhận / Nội dung. Lọc theo tháng đang chọn
// ở Bộ lọc, giống bảng Nhân sự.
export async function listTrainingRecords(periodId: number): Promise<TrainingRecordWithDetails[]> {
  const rows = await db("training_records")
    .join("members", "members.id", "training_records.member_id")
    .join("teams", "teams.id", "members.team_id")
    .join("periods", "periods.id", "training_records.period_id")
    .where("training_records.period_id", periodId)
    .select(
      "training_records.*",
      "members.name as member_name",
      "members.team_id as team_id",
      "teams.name as team_name",
      "periods.label as period_label",
    )
    .orderBy("teams.name", "asc")
    .orderBy("training_records.id", "desc");

  return rows as TrainingRecordWithDetails[];
}

export async function updateTrainingRecord(
  id: number,
  input: UpdateTrainingRecordInput,
): Promise<TrainingRecord | undefined> {
  const existing = await getTrainingRecord(id);
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

  const [updated] = await db("training_records")
    .where({ id })
    .update({
      ...merged,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as TrainingRecord;
}

export async function deleteTrainingRecord(id: number): Promise<boolean> {
  const count = await db("training_records").where({ id }).delete();
  return count > 0;
}

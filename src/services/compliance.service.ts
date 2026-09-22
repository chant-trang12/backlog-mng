import { db } from "../db/database.js";
import type {
  ComplianceRecord,
  ComplianceRecordWithDetails,
  CreateComplianceRecordInput,
  UpdateComplianceRecordInput,
} from "../types/cskh.js";
import { assertDepartmentInScope, departmentIdFromMemberId, type DataScope } from "./scope.util.js";

export async function createComplianceRecord(
  input: CreateComplianceRecordInput,
  scope: DataScope,
): Promise<ComplianceRecord> {
  const departmentId = await departmentIdFromMemberId(input.member_id);
  assertDepartmentInScope(scope, departmentId);
  const [created] = await db("compliance_records")
    .insert({
      period_id: input.period_id,
      member_id: input.member_id,
      department_id: departmentId,
      vi_pham: input.vi_pham ?? 0,
      noi_dung: input.noi_dung?.trim() || null,
    })
    .returning("*");
  return created as ComplianceRecord;
}

export async function getComplianceRecord(id: number): Promise<ComplianceRecord | undefined> {
  const row = await db("compliance_records").where({ id }).first();
  return row as ComplianceRecord | undefined;
}

// Danh sách bản ghi Tuân thủ của 1 tháng theo dõi (period_id), kèm tên nhân
// sự / team / nhãn tháng — hiển thị dạng bảng Tháng theo dõi / Team / Nhân sự
// / Vi phạm / Nội dung. Lọc theo tháng đang chọn ở Bộ lọc, giống bảng Nhân sự.
export async function listComplianceRecords(
  periodId: number,
  departmentId?: number | null,
): Promise<ComplianceRecordWithDetails[]> {
  const query = db("compliance_records")
    .join("members", "members.id", "compliance_records.member_id")
    .join("teams", "teams.id", "members.team_id")
    .join("periods", "periods.id", "compliance_records.period_id")
    .where("compliance_records.period_id", periodId)
    .select(
      "compliance_records.*",
      "members.name as member_name",
      "members.team_id as team_id",
      "teams.name as team_name",
      "periods.label as period_label",
    );
  if (departmentId != null) query.where("compliance_records.department_id", departmentId);
  const rows = await query.orderBy("teams.name", "asc").orderBy("compliance_records.id", "desc");

  return rows as ComplianceRecordWithDetails[];
}

export async function updateComplianceRecord(
  id: number,
  input: UpdateComplianceRecordInput,
  scope: DataScope,
): Promise<ComplianceRecord | undefined> {
  const existing = await getComplianceRecord(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);

  const merged = {
    member_id: input.member_id ?? existing.member_id,
    vi_pham: input.vi_pham ?? existing.vi_pham,
    noi_dung: input.noi_dung !== undefined ? input.noi_dung.trim() || null : existing.noi_dung,
  };

  const [updated] = await db("compliance_records")
    .where({ id })
    .update({
      ...merged,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as ComplianceRecord;
}

export async function deleteComplianceRecord(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getComplianceRecord(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);
  const count = await db("compliance_records").where({ id }).delete();
  return count > 0;
}

import { db } from "../db/database.js";
import type { Team } from "../types/backlog.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { softDeleteWhere, softDeleteWhereIn } from "./softDelete.util.js";

// Khai báo team theo từng tháng backlog (period_id) — làm trước khi nhập
// task, để task chọn team từ danh sách đã khai báo thay vì gõ tự do (tránh
// trùng tên do gõ sai chính tả). Idempotent theo (period_id, name) — thêm
// team ở tháng nào chỉ hiển thị từ tháng đó trở đi, không ảnh hưởng các
// tháng đã tạo trước đó.
export async function createTeam(
  name: string,
  periodId: number,
  departmentId: number | null | undefined,
  scope: DataScope,
): Promise<Team> {
  assertDepartmentInScope(scope, departmentId ?? null);
  const trimmed = name.trim();
  // is_deleted=false — team đã xóa mềm không tính là "đã có", tạo mới bình
  // thường đúng tên đó (khớp filtered unique index ở migration).
  const existing = await db("teams").where({ period_id: periodId, name: trimmed, is_deleted: false }).first();
  if (existing) return existing as Team;

  const [created] = await db("teams")
    .insert({ period_id: periodId, name: trimmed, department_id: departmentId ?? null })
    .returning("*");
  return created as Team;
}

export async function getTeam(id: number): Promise<Team | undefined> {
  const row = await db("teams").where({ id, is_deleted: false }).first();
  return row as Team | undefined;
}

export async function listTeams(periodId: number, departmentId?: number | null): Promise<Team[]> {
  const query = db("teams").where({ period_id: periodId, is_deleted: false });
  if (departmentId != null) query.where({ department_id: departmentId });
  const rows = await query.orderBy("name", "asc");
  return rows as Team[];
}

export async function deleteTeam(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getTeam(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, existing.department_id ?? null);
  return await db.transaction(async (trx) => {
    // Cascade xuống con cháu của từng nhân sự thuộc team này — TRƯỚC ĐÂY
    // chỉ xóa thẳng members, bỏ sót compliance/training/support/danh_gia/
    // task_members của các nhân sự đó (khác deleteMember() ở
    // member.service.ts vốn đã làm đủ cascade này) — vá luôn cho nhất quán
    // khi chuyển sang xóa mềm.
    const memberIds = (await trx("members").where({ team_id: id }).select("id")).map((m: { id: number }) => m.id);
    if (memberIds.length > 0) {
      await softDeleteWhereIn(trx, "compliance_records", "member_id", memberIds);
      await softDeleteWhereIn(trx, "training_records", "member_id", memberIds);
      await softDeleteWhereIn(trx, "support_records", "member_id", memberIds);
      await softDeleteWhereIn(trx, "danh_gia_records", "member_id", memberIds);
      await softDeleteWhereIn(trx, "task_members", "member_id", memberIds);
    }
    await softDeleteWhere(trx, "members", { team_id: id });
    await softDeleteWhere(trx, "incidents", { team_id: id });
    await softDeleteWhere(trx, "tickets", { team_id: id });
    await softDeleteWhere(trx, "creation_rates", { team_id: id });
    await softDeleteWhere(trx, "support_records", { team_nhan_ho_tro_id: id });
    const count = await softDeleteWhere(trx, "teams", { id });
    return count > 0;
  });
}

// Tháng mới tạo kế thừa danh sách team từ tháng gần nhất (giống nhân sự) —
// idempotent theo (period_id, name) nên gọi lại không tạo trùng.
export async function cloneTeamsFromPeriod(fromPeriodId: number, toPeriodId: number): Promise<void> {
  const sourceTeams = await db("teams").where({ period_id: fromPeriodId, is_deleted: false });
  for (const t of sourceTeams) {
    const existing = await db("teams").where({ period_id: toPeriodId, name: t.name, is_deleted: false }).first();
    if (!existing) {
      await db("teams").insert({ period_id: toPeriodId, name: t.name, department_id: t.department_id ?? null });
    }
  }
}

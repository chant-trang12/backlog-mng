import { db } from "../db/database.js";
import type { Team } from "../types/backlog.js";

// Khai báo team theo từng tháng backlog (period_id) — làm trước khi nhập
// task, để task chọn team từ danh sách đã khai báo thay vì gõ tự do (tránh
// trùng tên do gõ sai chính tả). Idempotent theo (period_id, name) — thêm
// team ở tháng nào chỉ hiển thị từ tháng đó trở đi, không ảnh hưởng các
// tháng đã tạo trước đó.
export async function createTeam(
  name: string,
  periodId: number,
  departmentId?: number | null,
): Promise<Team> {
  const trimmed = name.trim();
  const existing = await db("teams").where({ period_id: periodId, name: trimmed }).first();
  if (existing) return existing as Team;

  const [created] = await db("teams")
    .insert({ period_id: periodId, name: trimmed, department_id: departmentId ?? null })
    .returning("*");
  return created as Team;
}

export async function getTeam(id: number): Promise<Team | undefined> {
  const row = await db("teams").where({ id }).first();
  return row as Team | undefined;
}

export async function listTeams(periodId: number, departmentId?: number | null): Promise<Team[]> {
  const query = db("teams").where({ period_id: periodId });
  if (departmentId != null) query.where({ department_id: departmentId });
  const rows = await query.orderBy("name", "asc");
  return rows as Team[];
}

export async function deleteTeam(id: number): Promise<boolean> {
  return await db.transaction(async (trx) => {
    await trx("members").where({ team_id: id }).delete();
    await trx("incidents").where({ team_id: id }).delete();
    await trx("tickets").where({ team_id: id }).delete();
    await trx("creation_rates").where({ team_id: id }).delete();
    await trx("support_records").where({ team_nhan_ho_tro_id: id }).delete();
    const count = await trx("teams").where({ id }).delete();
    return count > 0;
  });
}

// Tháng mới tạo kế thừa danh sách team từ tháng gần nhất (giống nhân sự) —
// idempotent theo (period_id, name) nên gọi lại không tạo trùng.
export async function cloneTeamsFromPeriod(fromPeriodId: number, toPeriodId: number): Promise<void> {
  const sourceTeams = await db("teams").where({ period_id: fromPeriodId });
  for (const t of sourceTeams) {
    const existing = await db("teams").where({ period_id: toPeriodId, name: t.name }).first();
    if (!existing) {
      await db("teams").insert({ period_id: toPeriodId, name: t.name, department_id: t.department_id ?? null });
    }
  }
}

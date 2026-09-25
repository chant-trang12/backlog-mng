import { db } from "../db/database.js";
import type { Department } from "../types/backlog.js";

function toDepartment(row: any): Department {
  return {
    ...row,
    dung_tieu_chi_chung: Boolean(row.dung_tieu_chi_chung),
    is_full_access: Boolean(row.is_full_access),
  } as Department;
}

// Danh sách phòng — dùng chung cho mọi tháng backlog. Team (và nhân sự / task
// / CSKH qua đó) thuộc đúng 1 phòng.
export async function listDepartments(): Promise<Department[]> {
  const rows = await db("departments").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows.map(toDepartment);
}

export async function getDepartment(id: number): Promise<Department | undefined> {
  const row = await db("departments").where({ id }).first();
  return row ? toDepartment(row) : undefined;
}

export async function createDepartment(input: { name: string; code?: string }): Promise<Department> {
  const name = input.name.trim();
  const existing = await db("departments").where({ name }).first();
  if (existing) return toDepartment(existing);

  const maxRow = await db("departments").max({ m: "thu_tu" }).first();
  const thuTu = Number((maxRow as any)?.m ?? -1) + 1;

  const [created] = await db("departments")
    .insert({ name, code: input.code?.trim() || null, thu_tu: thuTu })
    .returning("*");
  return toDepartment(created);
}

export async function updateDepartment(
  id: number,
  input: {
    name?: string;
    code?: string;
    dung_tieu_chi_chung?: boolean;
    cach_tinh_kpi?: "theo_team" | "theo_task";
    is_full_access?: boolean;
  },
): Promise<Department | undefined> {
  const existing = await getDepartment(id);
  if (!existing) return undefined;

  const [updated] = await db("departments")
    .where({ id })
    .update({
      name: input.name?.trim() ?? existing.name,
      code: input.code !== undefined ? input.code.trim() || null : existing.code,
      dung_tieu_chi_chung:
        input.dung_tieu_chi_chung !== undefined ? (input.dung_tieu_chi_chung ? 1 : 0) : existing.dung_tieu_chi_chung ? 1 : 0,
      cach_tinh_kpi: input.cach_tinh_kpi ?? existing.cach_tinh_kpi,
      is_full_access:
        input.is_full_access !== undefined ? (input.is_full_access ? 1 : 0) : existing.is_full_access ? 1 : 0,
    })
    .returning("*");
  return toDepartment(updated);
}

// Chỉ cho xóa phòng khi không còn team nào thuộc phòng đó (tránh mồ côi
// nhân sự / task). FE hiển thị lỗi để người dùng chuyển team trước.
export async function deleteDepartment(id: number): Promise<{ ok: boolean; reason?: string }> {
  const teamCountRes = await db("teams").where({ department_id: id }).count({ c: "*" }).first();
  if (Number((teamCountRes as any)?.c ?? 0) > 0) {
    return { ok: false, reason: "Phòng vẫn còn team — xóa/chuyển hết team của phòng trước." };
  }
  // Gỡ liên kết thủ công trước khi xóa (FK feature_requests -> departments
  // dùng NO ACTION để tương thích MSSQL — không tự SET NULL qua DB, xem
  // migrations/featureRequests.ts).
  await db("feature_requests").where({ department_id: id }).update({ department_id: null });
  await db("feature_requests").where({ target_department_id: id }).update({ target_department_id: null });
  const count = await db("departments").where({ id }).delete();
  return { ok: count > 0 };
}

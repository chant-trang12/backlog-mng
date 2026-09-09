import { db } from "../db/database.js";
import type { Department } from "../types/backlog.js";

// Danh sách phòng — dùng chung cho mọi tháng backlog. Team (và nhân sự / task
// / CSKH qua đó) thuộc đúng 1 phòng.
export async function listDepartments(): Promise<Department[]> {
  const rows = await db("departments").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as Department[];
}

export async function getDepartment(id: number): Promise<Department | undefined> {
  const row = await db("departments").where({ id }).first();
  return row as Department | undefined;
}

export async function createDepartment(input: { name: string; code?: string }): Promise<Department> {
  const name = input.name.trim();
  const existing = await db("departments").where({ name }).first();
  if (existing) return existing as Department;

  const maxRow = await db("departments").max({ m: "thu_tu" }).first();
  const thuTu = Number((maxRow as any)?.m ?? -1) + 1;

  const [created] = await db("departments")
    .insert({ name, code: input.code?.trim() || null, thu_tu: thuTu })
    .returning("*");
  return created as Department;
}

export async function updateDepartment(
  id: number,
  input: { name?: string; code?: string },
): Promise<Department | undefined> {
  const existing = await getDepartment(id);
  if (!existing) return undefined;

  const [updated] = await db("departments")
    .where({ id })
    .update({
      name: input.name?.trim() ?? existing.name,
      code: input.code !== undefined ? input.code.trim() || null : existing.code,
    })
    .returning("*");
  return updated as Department;
}

// Chỉ cho xóa phòng khi không còn team nào thuộc phòng đó (tránh mồ côi
// nhân sự / task). FE hiển thị lỗi để người dùng chuyển team trước.
export async function deleteDepartment(id: number): Promise<{ ok: boolean; reason?: string }> {
  const teamCountRes = await db("teams").where({ department_id: id }).count({ c: "*" }).first();
  if (Number((teamCountRes as any)?.c ?? 0) > 0) {
    return { ok: false, reason: "Phòng vẫn còn team — xóa/chuyển hết team của phòng trước." };
  }
  const count = await db("departments").where({ id }).delete();
  return { ok: count > 0 };
}

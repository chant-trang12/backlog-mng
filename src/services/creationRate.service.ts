import { db } from "../db/database.js";
import type {
  CreateCreationRateInput,
  CreationRate,
  CreationRateWithTeam,
  UpdateCreationRateInput,
} from "../types/cskh.js";
import { assertDepartmentInScope, departmentIdFromTeamId, type DataScope } from "./scope.util.js";

function withTotals(
  row: CreationRate & { team_name: string; period_label: string },
): CreationRateWithTeam {
  const total = row.so_luong_thanh_cong + row.so_luong_that_bai;
  return {
    ...row,
    total,
    grand_total: total > 0 ? row.so_luong_thanh_cong / total : 0,
  };
}

export async function createCreationRate(input: CreateCreationRateInput, scope: DataScope): Promise<CreationRate> {
  const departmentId = await departmentIdFromTeamId(input.team_id);
  assertDepartmentInScope(scope, departmentId);
  const [created] = await db("creation_rates")
    .insert({
      period_id: input.period_id,
      team_id: input.team_id,
      department_id: departmentId,
      so_luong_thanh_cong: input.so_luong_thanh_cong ?? 0,
      so_luong_that_bai: input.so_luong_that_bai ?? 0,
    })
    .returning("*");
  return created as CreationRate;
}

export async function getCreationRate(id: number): Promise<CreationRate | undefined> {
  const row = await db("creation_rates").where({ id }).first();
  return row as CreationRate | undefined;
}

export async function listCreationRates(departmentId?: number | null): Promise<CreationRateWithTeam[]> {
  const query = db("creation_rates")
    .join("teams", "teams.id", "creation_rates.team_id")
    .join("periods", "periods.id", "creation_rates.period_id")
    .select(
      "creation_rates.*",
      "teams.name as team_name",
      "periods.label as period_label",
    );
  if (departmentId != null) query.where("creation_rates.department_id", departmentId);
  const rows = (await query
    .orderBy("periods.year", "desc")
    .orderBy("periods.month", "desc")
    .orderBy("teams.name", "asc")
    .orderBy("creation_rates.id", "desc")) as (CreationRate & { team_name: string; period_label: string })[];

  return rows.map(withTotals);
}

export async function updateCreationRate(
  id: number,
  input: UpdateCreationRateInput,
  scope: DataScope,
): Promise<CreationRate | undefined> {
  const existing = await getCreationRate(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);

  const merged = {
    period_id: input.period_id ?? existing.period_id,
    team_id: input.team_id ?? existing.team_id,
    so_luong_thanh_cong: input.so_luong_thanh_cong ?? existing.so_luong_thanh_cong,
    so_luong_that_bai: input.so_luong_that_bai ?? existing.so_luong_that_bai,
  };

  const [updated] = await db("creation_rates")
    .where({ id })
    .update({
      ...merged,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as CreationRate;
}

export async function deleteCreationRate(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getCreationRate(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);
  const count = await db("creation_rates").where({ id }).delete();
  return count > 0;
}

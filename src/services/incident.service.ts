import { db } from "../db/database.js";
import type {
  CreateIncidentInput,
  Incident,
  IncidentWithTeam,
  UpdateIncidentInput,
} from "../types/cskh.js";
import { assertDepartmentInScope, departmentIdFromTeamId, type DataScope } from "./scope.util.js";

export async function createIncident(input: CreateIncidentInput, scope: DataScope): Promise<Incident> {
  const departmentId = await departmentIdFromTeamId(input.team_id);
  assertDepartmentInScope(scope, departmentId);
  const [created] = await db("incidents")
    .insert({
      period_id: input.period_id,
      team_id: input.team_id,
      department_id: departmentId,
      su_co: input.su_co.trim(),
      tinh_chat: input.tinh_chat?.trim() || null,
    })
    .returning("*");
  return created as Incident;
}

export async function getIncident(id: number): Promise<Incident | undefined> {
  const row = await db("incidents").where({ id }).first();
  return row as Incident | undefined;
}

export async function listIncidents(departmentId?: number | null): Promise<IncidentWithTeam[]> {
  const query = db("incidents")
    .join("teams", "teams.id", "incidents.team_id")
    .join("periods", "periods.id", "incidents.period_id")
    .select(
      "incidents.*",
      "teams.name as team_name",
      "periods.label as period_label",
    );
  if (departmentId != null) query.where("incidents.department_id", departmentId);
  const rows = await query
    .orderBy("periods.year", "desc")
    .orderBy("periods.month", "desc")
    .orderBy("teams.name", "asc")
    .orderBy("incidents.id", "desc");

  return rows as IncidentWithTeam[];
}

export async function updateIncident(
  id: number,
  input: UpdateIncidentInput,
  scope: DataScope,
): Promise<Incident | undefined> {
  const existing = await getIncident(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);

  const merged = {
    period_id: input.period_id ?? existing.period_id,
    team_id: input.team_id ?? existing.team_id,
    su_co: input.su_co?.trim() ?? existing.su_co,
    tinh_chat: input.tinh_chat !== undefined ? input.tinh_chat.trim() || null : existing.tinh_chat,
  };

  const [updated] = await db("incidents")
    .where({ id })
    .update({
      ...merged,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as Incident;
}

export async function deleteIncident(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getIncident(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, (existing as any).department_id ?? null);
  const count = await db("incidents").where({ id }).delete();
  return count > 0;
}

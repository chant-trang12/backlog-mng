import { db } from "../db/database.js";
import type {
  CreateIncidentInput,
  Incident,
  IncidentWithTeam,
  UpdateIncidentInput,
} from "../types/cskh.js";

export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const [created] = await db("incidents")
    .insert({
      period_id: input.period_id,
      team_id: input.team_id,
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

export async function listIncidents(): Promise<IncidentWithTeam[]> {
  const rows = await db("incidents")
    .join("teams", "teams.id", "incidents.team_id")
    .join("periods", "periods.id", "incidents.period_id")
    .select(
      "incidents.*",
      "teams.name as team_name",
      "periods.label as period_label",
    )
    .orderBy("periods.year", "desc")
    .orderBy("periods.month", "desc")
    .orderBy("teams.name", "asc")
    .orderBy("incidents.id", "desc");

  return rows as IncidentWithTeam[];
}

export async function updateIncident(id: number, input: UpdateIncidentInput): Promise<Incident | undefined> {
  const existing = await getIncident(id);
  if (!existing) return undefined;

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

export async function deleteIncident(id: number): Promise<boolean> {
  const count = await db("incidents").where({ id }).delete();
  return count > 0;
}

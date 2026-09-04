import { db } from "../db/database.js";
import type {
  CreateIncidentInput,
  Incident,
  IncidentWithTeam,
  UpdateIncidentInput,
} from "../types/cskh.js";

export function createIncident(input: CreateIncidentInput): Incident {
  return db
    .prepare(
      `INSERT INTO incidents (period_id, team_id, su_co, tinh_chat) VALUES (?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.period_id,
      input.team_id,
      input.su_co.trim(),
      input.tinh_chat?.trim() || null,
    ) as Incident;
}

export function getIncident(id: number): Incident | undefined {
  return db.prepare(`SELECT * FROM incidents WHERE id = ?`).get(id) as Incident | undefined;
}

export function listIncidents(): IncidentWithTeam[] {
  return db
    .prepare(
      `SELECT incidents.*, teams.name AS team_name, periods.label AS period_label
       FROM incidents
       JOIN teams ON teams.id = incidents.team_id
       JOIN periods ON periods.id = incidents.period_id
       ORDER BY periods.year DESC, periods.month DESC, teams.name ASC, incidents.id DESC`,
    )
    .all() as IncidentWithTeam[];
}

export function updateIncident(id: number, input: UpdateIncidentInput): Incident | undefined {
  const existing = getIncident(id);
  if (!existing) return undefined;

  const merged = {
    period_id: input.period_id ?? existing.period_id,
    team_id: input.team_id ?? existing.team_id,
    su_co: input.su_co?.trim() ?? existing.su_co,
    tinh_chat: input.tinh_chat !== undefined ? input.tinh_chat.trim() || null : existing.tinh_chat,
  };

  return db
    .prepare(
      `UPDATE incidents SET period_id = ?, team_id = ?, su_co = ?, tinh_chat = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .get(merged.period_id, merged.team_id, merged.su_co, merged.tinh_chat, id) as Incident;
}

export function deleteIncident(id: number): boolean {
  const result = db.prepare(`DELETE FROM incidents WHERE id = ?`).run(id);
  return result.changes > 0;
}

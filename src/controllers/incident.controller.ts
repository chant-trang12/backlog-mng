import type { Request, Response } from "express";
import {
  createIncident,
  deleteIncident,
  listIncidents,
  updateIncident,
} from "../services/incident.service.js";
import { getTeam } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function createIncidentHandler(req: Request, res: Response) {
  const { su_co, tinh_chat, team_id, period_id } = req.body ?? {};
  if (!isNonEmptyText(su_co)) {
    return res.status(400).json({ error: "Trường 'su_co' là bắt buộc" });
  }
  const teamId = Number(team_id);
  if (!getTeam(teamId)) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const incident = createIncident({ period_id: periodId, team_id: teamId, su_co, tinh_chat });
  res.status(201).json(incident);
}

export async function listIncidentsHandler(_req: Request, res: Response) {
  res.json(listIncidents());
}

export async function updateIncidentHandler(req: Request, res: Response) {
  const { su_co, tinh_chat, team_id, period_id } = req.body ?? {};
  if (team_id !== undefined && !getTeam(Number(team_id))) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  if (period_id !== undefined && !getPeriod(Number(period_id))) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const incident = updateIncident(Number(req.params.id), {
    su_co,
    tinh_chat,
    team_id: team_id !== undefined ? Number(team_id) : undefined,
    period_id: period_id !== undefined ? Number(period_id) : undefined,
  });
  if (!incident) return res.status(404).json({ error: "Không tìm thấy sự cố" });
  res.json(incident);
}

export async function deleteIncidentHandler(req: Request, res: Response) {
  const ok = deleteIncident(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy sự cố" });
  res.status(204).send();
}

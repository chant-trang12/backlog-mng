import type { Request, Response } from "express";
import {
  createIncident,
  deleteIncident,
  listIncidents,
  updateIncident,
} from "../services/incident.service.js";
import { getTeam } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function createIncidentHandler(req: Request, res: Response) {
  const { su_co, tinh_chat, team_id, period_id } = req.body ?? {};
  if (!isNonEmptyText(su_co)) {
    return res.status(400).json({ error: "Trường 'su_co' là bắt buộc" });
  }
  const teamId = Number(team_id);
  const team = await getTeam(teamId);
  if (!team) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  const periodId = Number(period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const incident = await createIncident({ period_id: periodId, team_id: teamId, su_co, tinh_chat });
  res.status(201).json(incident);
}

export async function listIncidentsHandler(_req: Request, res: Response) {
  res.json(await listIncidents());
}

export async function updateIncidentHandler(req: Request, res: Response) {
  const { su_co, tinh_chat, team_id, period_id } = req.body ?? {};
  if (team_id !== undefined) {
    const team = await getTeam(Number(team_id));
    if (!team) {
      return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
    }
  }
  if (period_id !== undefined) {
    const period = await getPeriod(Number(period_id));
    if (!period) {
      return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
    }
  }

  const incident = await updateIncident(Number(req.params.id), {
    su_co,
    tinh_chat,
    team_id: team_id !== undefined ? Number(team_id) : undefined,
    period_id: period_id !== undefined ? Number(period_id) : undefined,
  });
  if (!incident) return res.status(404).json({ error: "Không tìm thấy sự cố" });
  res.json(incident);
}

export async function deleteIncidentHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteIncident(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy sự cố" });
  res.status(204).send();
}

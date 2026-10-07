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
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

export async function createIncidentHandler(req: Request, res: Response) {
  const body = req.body ?? {};
  if (!isNonEmptyText(body.ten_su_co)) {
    return res.status(400).json({ error: "Trường 'ten_su_co' là bắt buộc" });
  }
  const teamId = Number(body.team_id);
  const team = await getTeam(teamId);
  if (!team) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  const periodId = Number(body.period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const incident = await createIncident(
    { ...body, period_id: periodId, team_id: teamId, ten_su_co: String(body.ten_su_co) },
    scopeOf(req),
  );
  res.status(201).json(incident);
}

export async function listIncidentsHandler(req: Request, res: Response) {
  const departmentId = resolveListDepartmentId(scopeOf(req), null);
  if (departmentId === SCOPE_EMPTY) return res.json([]);
  res.json(await listIncidents(departmentId));
}

export async function updateIncidentHandler(req: Request, res: Response) {
  const body = req.body ?? {};
  if (body.team_id !== undefined) {
    const team = await getTeam(Number(body.team_id));
    if (!team) {
      return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
    }
  }
  if (body.period_id !== undefined) {
    const period = await getPeriod(Number(body.period_id));
    if (!period) {
      return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
    }
  }

  const incident = await updateIncident(
    Number(req.params.id),
    {
      ...body,
      team_id: body.team_id !== undefined ? Number(body.team_id) : undefined,
      period_id: body.period_id !== undefined ? Number(body.period_id) : undefined,
    },
    scopeOf(req),
  );
  if (!incident) return res.status(404).json({ error: "Không tìm thấy sự cố" });
  res.json(incident);
}

export async function deleteIncidentHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteIncident(id, scopeOf(req));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy sự cố" });
  res.status(204).send();
}

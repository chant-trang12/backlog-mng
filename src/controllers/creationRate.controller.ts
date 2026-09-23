import type { Request, Response } from "express";
import {
  createCreationRate,
  deleteCreationRate,
  listCreationRates,
  updateCreationRate,
} from "../services/creationRate.service.js";
import { getTeam } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";
import { parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

export async function createCreationRateHandler(req: Request, res: Response) {
  const { so_luong_thanh_cong, so_luong_that_bai, team_id, period_id } = req.body ?? {};
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

  const rate = await createCreationRate(
    {
      period_id: periodId,
      team_id: teamId,
      so_luong_thanh_cong: so_luong_thanh_cong !== undefined ? Number(so_luong_thanh_cong) : undefined,
      so_luong_that_bai: so_luong_that_bai !== undefined ? Number(so_luong_that_bai) : undefined,
    },
    scopeOf(req),
  );
  res.status(201).json(rate);
}

export async function listCreationRatesHandler(req: Request, res: Response) {
  const departmentId = resolveListDepartmentId(scopeOf(req), null);
  if (departmentId === SCOPE_EMPTY) return res.json([]);
  res.json(await listCreationRates(departmentId));
}

export async function updateCreationRateHandler(req: Request, res: Response) {
  const { so_luong_thanh_cong, so_luong_that_bai, team_id, period_id } = req.body ?? {};
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

  const rate = await updateCreationRate(
    Number(req.params.id),
    {
      team_id: team_id !== undefined ? Number(team_id) : undefined,
      period_id: period_id !== undefined ? Number(period_id) : undefined,
      so_luong_thanh_cong: so_luong_thanh_cong !== undefined ? Number(so_luong_thanh_cong) : undefined,
      so_luong_that_bai: so_luong_that_bai !== undefined ? Number(so_luong_that_bai) : undefined,
    },
    scopeOf(req),
  );
  if (!rate) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });
  res.json(rate);
}

export async function deleteCreationRateHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteCreationRate(id, scopeOf(req));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });
  res.status(204).send();
}

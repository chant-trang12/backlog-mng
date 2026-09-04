import type { Request, Response } from "express";
import {
  createCreationRate,
  deleteCreationRate,
  listCreationRates,
  updateCreationRate,
} from "../services/creationRate.service.js";
import { getTeam } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";

export async function createCreationRateHandler(req: Request, res: Response) {
  const { so_luong_thanh_cong, so_luong_that_bai, team_id, period_id } = req.body ?? {};
  const teamId = Number(team_id);
  if (!getTeam(teamId)) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const rate = createCreationRate({
    period_id: periodId,
    team_id: teamId,
    so_luong_thanh_cong: so_luong_thanh_cong !== undefined ? Number(so_luong_thanh_cong) : undefined,
    so_luong_that_bai: so_luong_that_bai !== undefined ? Number(so_luong_that_bai) : undefined,
  });
  res.status(201).json(rate);
}

export async function listCreationRatesHandler(_req: Request, res: Response) {
  res.json(listCreationRates());
}

export async function updateCreationRateHandler(req: Request, res: Response) {
  const { so_luong_thanh_cong, so_luong_that_bai, team_id, period_id } = req.body ?? {};
  if (team_id !== undefined && !getTeam(Number(team_id))) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  if (period_id !== undefined && !getPeriod(Number(period_id))) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const rate = updateCreationRate(Number(req.params.id), {
    team_id: team_id !== undefined ? Number(team_id) : undefined,
    period_id: period_id !== undefined ? Number(period_id) : undefined,
    so_luong_thanh_cong: so_luong_thanh_cong !== undefined ? Number(so_luong_thanh_cong) : undefined,
    so_luong_that_bai: so_luong_that_bai !== undefined ? Number(so_luong_that_bai) : undefined,
  });
  if (!rate) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });
  res.json(rate);
}

export async function deleteCreationRateHandler(req: Request, res: Response) {
  const ok = deleteCreationRate(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy dữ liệu" });
  res.status(204).send();
}

import type { Request, Response } from "express";
import { createTeam, deleteTeam, listTeams } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Khai báo team mới cho 1 tháng backlog (period_id) — chỉ hiển thị từ tháng
// đó trở đi, không hiển thị ngược ở các tháng đã tạo trước đó.
export async function createTeamHandler(req: Request, res: Response) {
  const { name, period_id } = req.body ?? {};
  if (!isNonEmptyText(name)) {
    return res.status(400).json({ error: "Trường 'name' là bắt buộc" });
  }
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const team = createTeam(name, periodId);
  res.status(201).json(team);
}

// GET /api/teams?period_id=X — danh sách team của đúng tháng backlog đang chọn.
export async function listTeamsHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(listTeams(periodId));
}

export async function deleteTeamHandler(req: Request, res: Response) {
  const ok = deleteTeam(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy team" });
  res.status(204).send();
}

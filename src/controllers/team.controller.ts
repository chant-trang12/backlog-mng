import type { Request, Response } from "express";
import { createTeam, deleteTeam, listTeams } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}

// Khai báo team mới cho 1 tháng backlog (period_id) — chỉ hiển thị từ tháng
// đó trở đi, không hiển thị ngược ở các tháng đã tạo trước đó.
export async function createTeamHandler(req: Request, res: Response) {
  const { name, period_id, department_id } = req.body ?? {};
  if (!isNonEmptyText(name)) {
    return res.status(400).json({ error: "Trường 'name' là bắt buộc" });
  }
  const periodId = Number(period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }
  const departmentId = department_id != null ? Number(department_id) : null;

  const team = await createTeam(name, periodId, departmentId, scopeOf(req));
  res.status(201).json(team);
}

// GET /api/teams?period_id=X — danh sách team của đúng tháng backlog đang chọn.
export async function listTeamsHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  const requestedDepartmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const departmentId = resolveListDepartmentId(scopeOf(req), requestedDepartmentId);
  if (departmentId === SCOPE_EMPTY) return res.json([]);
  res.json(await listTeams(periodId, departmentId));
}

export async function deleteTeamHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteTeam(id, scopeOf(req));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy team" });
  res.status(204).send();
}

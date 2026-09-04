import type { Request, Response } from "express";
import {
  createMember,
  deleteMember,
  deleteMembers,
  listMembers,
  updateMember,
} from "../services/member.service.js";
import { getTeam } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Khai báo nhân sự mới — dạng bảng CRUD: Họ và Tên, Chức vụ, Team. Gắn theo
// period_id (tháng backlog) — xóa/sửa ở tháng nào chỉ ảnh hưởng tháng đó.
export async function createMemberHandler(req: Request, res: Response) {
  const { name, chuc_vu, team_id, period_id, tuan_thu, noi_quy, dao_tao, ho_tro, danh_gia } = req.body ?? {};
  if (!isNonEmptyText(name)) {
    return res.status(400).json({ error: "Trường 'name' là bắt buộc" });
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

  const member = await createMember({
    name,
    chuc_vu,
    team_id: teamId,
    period_id: periodId,
    tuan_thu,
    noi_quy,
    dao_tao,
    ho_tro,
    danh_gia,
  });
  res.status(201).json(member);
}

// GET /api/members?period_id=X — danh sách nhân sự của 1 tháng backlog.
export async function listMembersHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(await listMembers(periodId));
}

export async function updateMemberHandler(req: Request, res: Response) {
  const { name, chuc_vu, team_id, tuan_thu, noi_quy, dao_tao, ho_tro, danh_gia } = req.body ?? {};
  if (team_id !== undefined) {
    const team = await getTeam(Number(team_id));
    if (!team) {
      return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
    }
  }

  const member = await updateMember(Number(req.params.id), {
    name,
    chuc_vu,
    team_id: team_id !== undefined ? Number(team_id) : undefined,
    tuan_thu,
    noi_quy,
    dao_tao,
    ho_tro,
    danh_gia,
  });
  if (!member) return res.status(404).json({ error: "Không tìm thấy nhân sự" });
  res.json(member);
}

export async function deleteMemberHandler(req: Request, res: Response) {
  const ok = await deleteMember(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy nhân sự" });
  res.status(204).send();
}

// Xóa nhiều nhân sự theo checkbox đã chọn trên bảng.
export async function deleteSelectedMembersHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const deleted = await deleteMembers(ids.map((id: unknown) => Number(id)));
  res.json({ deleted });
}

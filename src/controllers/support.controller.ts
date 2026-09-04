import type { Request, Response } from "express";
import {
  createSupportRecord,
  deleteSupportRecord,
  listSupportRecords,
  updateSupportRecord,
} from "../services/support.service.js";
import { getMember } from "../services/member.service.js";
import { getPeriod } from "../services/period.service.js";
import { getTeam } from "../services/team.service.js";

// Thêm mới bản ghi Hỗ trợ — Tháng theo dõi lấy từ period_id do client gửi
// (gán theo Bộ lọc "Tháng" đang chọn ở trang Team & Nhân sự, không cho người
// dùng tự chọn tháng khi thêm mới). Team thực hiện hỗ trợ = team của nhân sự
// được chọn (member_id), không lưu riêng.
export async function createSupportRecordHandler(req: Request, res: Response) {
  const { member_id, team_nhan_ho_tro_id, period_id, noi_dung, ngay_ho_tro, nguoi_xac_nhan } = req.body ?? {};
  const memberId = Number(member_id);
  const member = await getMember(memberId);
  if (!member) {
    return res.status(400).json({ error: "Trường 'member_id' không hợp lệ" });
  }
  const teamNhanHoTroId = Number(team_nhan_ho_tro_id);
  const teamNhan = await getTeam(teamNhanHoTroId);
  if (!teamNhan) {
    return res.status(400).json({ error: "Trường 'team_nhan_ho_tro_id' không hợp lệ" });
  }
  const periodId = Number(period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const record = await createSupportRecord({
    period_id: periodId,
    member_id: memberId,
    team_nhan_ho_tro_id: teamNhanHoTroId,
    noi_dung,
    ngay_ho_tro,
    nguoi_xac_nhan,
  });
  res.status(201).json(record);
}

// GET /api/support-records?period_id=X — danh sách theo tháng đang lọc.
export async function listSupportRecordsHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(await listSupportRecords(periodId));
}

export async function updateSupportRecordHandler(req: Request, res: Response) {
  const { member_id, team_nhan_ho_tro_id, noi_dung, ngay_ho_tro, nguoi_xac_nhan } = req.body ?? {};
  if (member_id !== undefined) {
    const member = await getMember(Number(member_id));
    if (!member) {
      return res.status(400).json({ error: "Trường 'member_id' không hợp lệ" });
    }
  }
  if (team_nhan_ho_tro_id !== undefined) {
    const team = await getTeam(Number(team_nhan_ho_tro_id));
    if (!team) {
      return res.status(400).json({ error: "Trường 'team_nhan_ho_tro_id' không hợp lệ" });
    }
  }

  const record = await updateSupportRecord(Number(req.params.id), {
    member_id: member_id !== undefined ? Number(member_id) : undefined,
    team_nhan_ho_tro_id: team_nhan_ho_tro_id !== undefined ? Number(team_nhan_ho_tro_id) : undefined,
    noi_dung,
    ngay_ho_tro,
    nguoi_xac_nhan,
  });
  if (!record) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.json(record);
}

export async function deleteSupportRecordHandler(req: Request, res: Response) {
  const ok = await deleteSupportRecord(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).send();
}

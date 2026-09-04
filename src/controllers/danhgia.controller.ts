import type { Request, Response } from "express";
import {
  deleteDanhGiaRecord,
  listDanhGiaRecords,
  updateDanhGiaRecord,
  upsertDanhGiaRecords,
} from "../services/danhgia.service.js";
import { getMember } from "../services/member.service.js";
import { getPeriod } from "../services/period.service.js";
import { getTeam } from "../services/team.service.js";

// POST /api/danh-gia-records/bulk { period_id, team_id, entries: [{member_id, so_thu_tu}] }
// — "+ Thêm Đánh giá": nhập Số thứ tự cho nhiều nhân sự của 1 team cùng
// lúc. Mỗi entry phải thuộc đúng team_id đã chọn và tháng theo dõi period_id.
export async function bulkUpsertDanhGiaRecordsHandler(req: Request, res: Response) {
  const { period_id, team_id, entries } = req.body ?? {};
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }
  const teamId = Number(team_id);
  if (!getTeam(teamId)) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: "Trường 'entries' phải là mảng không rỗng" });
  }

  const parsedEntries: { member_id: number; so_thu_tu: number }[] = [];
  for (const entry of entries) {
    const memberId = Number(entry?.member_id);
    const member = getMember(memberId);
    if (!member || member.team_id !== teamId || member.period_id !== periodId) {
      return res.status(400).json({ error: `Nhân sự (member_id=${entry?.member_id}) không hợp lệ hoặc không thuộc team/tháng đã chọn` });
    }
    const soThuTu = Number(entry?.so_thu_tu);
    if (!Number.isFinite(soThuTu)) {
      return res.status(400).json({ error: `Số thứ tự của nhân sự (member_id=${memberId}) phải là số` });
    }
    parsedEntries.push({ member_id: memberId, so_thu_tu: soThuTu });
  }

  upsertDanhGiaRecords(periodId, parsedEntries);
  res.status(201).json(listDanhGiaRecords(periodId));
}

// GET /api/danh-gia-records?period_id=X — danh sách theo tháng đang lọc.
export async function listDanhGiaRecordsHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(listDanhGiaRecords(periodId));
}

export async function updateDanhGiaRecordHandler(req: Request, res: Response) {
  const { so_thu_tu } = req.body ?? {};
  const soThuTu = Number(so_thu_tu);
  if (!Number.isFinite(soThuTu)) {
    return res.status(400).json({ error: "Trường 'so_thu_tu' phải là số" });
  }
  const record = updateDanhGiaRecord(Number(req.params.id), soThuTu);
  if (!record) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.json(record);
}

export async function deleteDanhGiaRecordHandler(req: Request, res: Response) {
  const ok = deleteDanhGiaRecord(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).send();
}

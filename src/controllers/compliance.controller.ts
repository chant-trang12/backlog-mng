import type { Request, Response } from "express";
import {
  createComplianceRecord,
  deleteComplianceRecord,
  listComplianceRecords,
  updateComplianceRecord,
} from "../services/compliance.service.js";
import { getMember } from "../services/member.service.js";
import { getPeriod } from "../services/period.service.js";

// Thêm mới bản ghi Tuân thủ — Tháng theo dõi lấy từ period_id do client gửi
// (gán theo Bộ lọc "Tháng" đang chọn ở trang Team & Nhân sự, không cho người
// dùng tự chọn tháng khi thêm mới). Vi phạm chỉ nhận số.
export async function createComplianceRecordHandler(req: Request, res: Response) {
  const { member_id, period_id, vi_pham, noi_dung } = req.body ?? {};
  const memberId = Number(member_id);
  if (!getMember(memberId)) {
    return res.status(400).json({ error: "Trường 'member_id' không hợp lệ" });
  }
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }
  const viPham = vi_pham === undefined ? 0 : Number(vi_pham);
  if (!Number.isFinite(viPham)) {
    return res.status(400).json({ error: "Trường 'vi_pham' phải là số" });
  }

  const record = createComplianceRecord({
    period_id: periodId,
    member_id: memberId,
    vi_pham: viPham,
    noi_dung,
  });
  res.status(201).json(record);
}

// GET /api/compliance-records?period_id=X — danh sách theo tháng đang lọc.
export async function listComplianceRecordsHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(listComplianceRecords(periodId));
}

export async function updateComplianceRecordHandler(req: Request, res: Response) {
  const { member_id, vi_pham, noi_dung } = req.body ?? {};
  if (member_id !== undefined && !getMember(Number(member_id))) {
    return res.status(400).json({ error: "Trường 'member_id' không hợp lệ" });
  }
  if (vi_pham !== undefined && !Number.isFinite(Number(vi_pham))) {
    return res.status(400).json({ error: "Trường 'vi_pham' phải là số" });
  }

  const record = updateComplianceRecord(Number(req.params.id), {
    member_id: member_id !== undefined ? Number(member_id) : undefined,
    vi_pham: vi_pham !== undefined ? Number(vi_pham) : undefined,
    noi_dung,
  });
  if (!record) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.json(record);
}

export async function deleteComplianceRecordHandler(req: Request, res: Response) {
  const ok = deleteComplianceRecord(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).send();
}

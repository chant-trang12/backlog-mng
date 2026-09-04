import type { Request, Response } from "express";
import {
  createTrainingRecord,
  deleteTrainingRecord,
  listTrainingRecords,
  updateTrainingRecord,
} from "../services/training.service.js";
import { getMember } from "../services/member.service.js";
import { getPeriod } from "../services/period.service.js";

const LOAI_OPTIONS = ["Đào tạo", "Chứng chỉ QT"];

function isValidLoai(value: unknown): value is string {
  return typeof value === "string" && LOAI_OPTIONS.includes(value);
}

// Thêm mới bản ghi Đào tạo — Tháng theo dõi lấy từ period_id do client gửi
// (gán theo Bộ lọc "Tháng" đang chọn ở trang Team & Nhân sự, không cho người
// dùng tự chọn tháng khi thêm mới). Loại chỉ nhận 1 trong 2 giá trị cố định.
export async function createTrainingRecordHandler(req: Request, res: Response) {
  const { member_id, period_id, loai, ngay_thuc_hien, nguoi_xac_nhan, noi_dung } = req.body ?? {};
  if (!isValidLoai(loai)) {
    return res.status(400).json({ error: `Trường 'loai' phải là 1 trong: ${LOAI_OPTIONS.join(", ")}` });
  }
  const memberId = Number(member_id);
  if (!getMember(memberId)) {
    return res.status(400).json({ error: "Trường 'member_id' không hợp lệ" });
  }
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const record = createTrainingRecord({
    period_id: periodId,
    member_id: memberId,
    loai,
    ngay_thuc_hien,
    nguoi_xac_nhan,
    noi_dung,
  });
  res.status(201).json(record);
}

// GET /api/training-records?period_id=X — danh sách theo tháng đang lọc.
export async function listTrainingRecordsHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(listTrainingRecords(periodId));
}

export async function updateTrainingRecordHandler(req: Request, res: Response) {
  const { member_id, loai, ngay_thuc_hien, nguoi_xac_nhan, noi_dung } = req.body ?? {};
  if (member_id !== undefined && !getMember(Number(member_id))) {
    return res.status(400).json({ error: "Trường 'member_id' không hợp lệ" });
  }
  if (loai !== undefined && !isValidLoai(loai)) {
    return res.status(400).json({ error: `Trường 'loai' phải là 1 trong: ${LOAI_OPTIONS.join(", ")}` });
  }

  const record = updateTrainingRecord(Number(req.params.id), {
    member_id: member_id !== undefined ? Number(member_id) : undefined,
    loai,
    ngay_thuc_hien,
    nguoi_xac_nhan,
    noi_dung,
  });
  if (!record) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.json(record);
}

export async function deleteTrainingRecordHandler(req: Request, res: Response) {
  const ok = deleteTrainingRecord(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy bản ghi" });
  res.status(204).send();
}

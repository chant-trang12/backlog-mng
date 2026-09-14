import type { Request, Response } from "express";
import { createPeriod, deletePeriod, getPeriod, listPeriods } from "../services/period.service.js";
import { syncRoadmapItemsForPeriod } from "../services/roadmap.service.js";
import { parsePositiveInt } from "../utils/validate.js";

// 1.2 Tạo mới một backlog theo tháng. Sau khi tạo, tự động đưa các nhiệm vụ
// Roadmap năm có "Ngày bắt đầu" rơi vào đúng tháng này vào backlog (nếu
// chưa được đưa vào trước đó) — xem roadmap.service.ts#syncRoadmapItemsForPeriod.
export async function createPeriodHandler(req: Request, res: Response) {
  const { year, month, label } = req.body ?? {};
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return res.status(400).json({ error: "Trường 'year' và 'month' (1-12) là bắt buộc" });
  }
  const period = await createPeriod({ year: y, month: m, label });
  await syncRoadmapItemsForPeriod(period.year, period.month);
  res.status(201).json(period);
}

export async function listPeriodsHandler(_req: Request, res: Response) {
  res.json(await listPeriods());
}

export async function getPeriodHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const period = await getPeriod(id);
  if (!period) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });
  res.json(period);
}

export async function deletePeriodHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deletePeriod(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });
  res.status(204).send();
}

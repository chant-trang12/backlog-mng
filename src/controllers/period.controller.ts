import type { Request, Response } from "express";
import { createPeriod, deletePeriod, getPeriod, listPeriods } from "../services/period.service.js";

// 1.2 Tạo mới một backlog theo tháng.
export async function createPeriodHandler(req: Request, res: Response) {
  const { year, month, label } = req.body ?? {};
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return res.status(400).json({ error: "Trường 'year' và 'month' (1-12) là bắt buộc" });
  }
  const period = await createPeriod({ year: y, month: m, label });
  res.status(201).json(period);
}

export async function listPeriodsHandler(_req: Request, res: Response) {
  res.json(await listPeriods());
}

export async function getPeriodHandler(req: Request, res: Response) {
  const period = await getPeriod(Number(req.params.id));
  if (!period) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });
  res.json(period);
}

export async function deletePeriodHandler(req: Request, res: Response) {
  const ok = await deletePeriod(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy tháng backlog" });
  res.status(204).send();
}

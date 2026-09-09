import type { Request, Response } from "express";
import {
  createHeThong,
  deleteHeThong,
  listHeThong,
  updateHeThong,
} from "../services/hethong.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listHeThongHandler(_req: Request, res: Response) {
  res.json(await listHeThong());
}

export async function createHeThongHandler(req: Request, res: Response) {
  const { ten_he_thong } = req.body ?? {};
  if (!isNonEmptyText(ten_he_thong)) {
    return res.status(400).json({ error: "Trường 'ten_he_thong' là bắt buộc" });
  }
  res.status(201).json(await createHeThong({ ten_he_thong }));
}

export async function updateHeThongHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { ten_he_thong, thu_tu } = req.body ?? {};
  const row = await updateHeThong(id, {
    ten_he_thong,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!row) return res.status(404).json({ error: "Không tìm thấy hệ thống" });
  res.json(row);
}

export async function deleteHeThongHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteHeThong(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy hệ thống" });
  res.status(204).send();
}

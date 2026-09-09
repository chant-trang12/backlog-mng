import type { Request, Response } from "express";
import {
  createMucTieu,
  deleteMucTieu,
  listMucTieu,
  updateMucTieu,
} from "../services/muctieu.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listMucTieuHandler(_req: Request, res: Response) {
  res.json(await listMucTieu());
}

export async function createMucTieuHandler(req: Request, res: Response) {
  const { ten_muc_tieu } = req.body ?? {};
  if (!isNonEmptyText(ten_muc_tieu)) {
    return res.status(400).json({ error: "Trường 'ten_muc_tieu' là bắt buộc" });
  }
  res.status(201).json(await createMucTieu({ ten_muc_tieu }));
}

export async function updateMucTieuHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { ten_muc_tieu, thu_tu } = req.body ?? {};
  const row = await updateMucTieu(id, {
    ten_muc_tieu,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!row) return res.status(404).json({ error: "Không tìm thấy mục tiêu" });
  res.json(row);
}

export async function deleteMucTieuHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteMucTieu(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy mục tiêu" });
  res.status(204).send();
}

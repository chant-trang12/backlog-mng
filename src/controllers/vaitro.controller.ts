import type { Request, Response } from "express";
import {
  createVaiTro,
  deleteVaiTro,
  listVaiTro,
  updateVaiTro,
} from "../services/vaitro.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listVaiTroHandler(_req: Request, res: Response) {
  res.json(await listVaiTro());
}

export async function createVaiTroHandler(req: Request, res: Response) {
  const { ten_vai_tro } = req.body ?? {};
  if (!isNonEmptyText(ten_vai_tro)) {
    return res.status(400).json({ error: "Trường 'ten_vai_tro' là bắt buộc" });
  }
  res.status(201).json(await createVaiTro({ ten_vai_tro }));
}

export async function updateVaiTroHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { ten_vai_tro, thu_tu } = req.body ?? {};
  const row = await updateVaiTro(id, {
    ten_vai_tro,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!row) return res.status(404).json({ error: "Không tìm thấy vai trò" });
  res.json(row);
}

export async function deleteVaiTroHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteVaiTro(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy vai trò" });
  res.status(204).send();
}

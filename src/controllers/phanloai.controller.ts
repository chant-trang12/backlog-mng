import type { Request, Response } from "express";
import { createPhanLoai, deletePhanLoai, listPhanLoai, updatePhanLoai } from "../services/phanloai.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listPhanLoaiHandler(_req: Request, res: Response) {
  res.json(await listPhanLoai());
}

export async function createPhanLoaiHandler(req: Request, res: Response) {
  const { ten_phan_loai } = req.body ?? {};
  if (!isNonEmptyText(ten_phan_loai)) {
    return res.status(400).json({ error: "Trường 'ten_phan_loai' là bắt buộc" });
  }
  const phanLoai = await createPhanLoai({ ten_phan_loai });
  res.status(201).json(phanLoai);
}

export async function updatePhanLoaiHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { ten_phan_loai, thu_tu } = req.body ?? {};
  const phanLoai = await updatePhanLoai(id, {
    ten_phan_loai,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!phanLoai) return res.status(404).json({ error: "Không tìm thấy phân loại" });
  res.json(phanLoai);
}

export async function deletePhanLoaiHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deletePhanLoai(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy phân loại" });
  res.status(204).send();
}

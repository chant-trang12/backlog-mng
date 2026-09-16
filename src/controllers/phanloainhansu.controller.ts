import type { Request, Response } from "express";
import {
  createPhanLoaiNhanSu,
  deletePhanLoaiNhanSu,
  listPhanLoaiNhanSu,
  updatePhanLoaiNhanSu,
} from "../services/phanloainhansu.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listPhanLoaiNhanSuHandler(_req: Request, res: Response) {
  res.json(await listPhanLoaiNhanSu());
}

export async function createPhanLoaiNhanSuHandler(req: Request, res: Response) {
  const { ten_phan_loai } = req.body ?? {};
  if (!isNonEmptyText(ten_phan_loai)) {
    return res.status(400).json({ error: "Trường 'ten_phan_loai' là bắt buộc" });
  }
  res.status(201).json(await createPhanLoaiNhanSu({ ten_phan_loai }));
}

export async function updatePhanLoaiNhanSuHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { ten_phan_loai, thu_tu } = req.body ?? {};
  const row = await updatePhanLoaiNhanSu(id, {
    ten_phan_loai,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!row) return res.status(404).json({ error: "Không tìm thấy phân loại" });
  res.json(row);
}

export async function deletePhanLoaiNhanSuHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deletePhanLoaiNhanSu(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy phân loại" });
  res.status(204).send();
}

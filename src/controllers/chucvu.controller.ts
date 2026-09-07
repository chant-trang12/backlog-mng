import type { Request, Response } from "express";
import { createChucVu, deleteChucVu, listChucVu, updateChucVu } from "../services/chucvu.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listChucVuHandler(_req: Request, res: Response) {
  res.json(await listChucVu());
}

export async function createChucVuHandler(req: Request, res: Response) {
  const { ten_chuc_vu } = req.body ?? {};
  if (!isNonEmptyText(ten_chuc_vu)) {
    return res.status(400).json({ error: "Trường 'ten_chuc_vu' là bắt buộc" });
  }
  const chucVu = await createChucVu({ ten_chuc_vu });
  res.status(201).json(chucVu);
}

export async function updateChucVuHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { ten_chuc_vu, thu_tu } = req.body ?? {};
  const chucVu = await updateChucVu(id, {
    ten_chuc_vu,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!chucVu) return res.status(404).json({ error: "Không tìm thấy chức vụ" });
  res.json(chucVu);
}

export async function deleteChucVuHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteChucVu(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy chức vụ" });
  res.status(204).send();
}

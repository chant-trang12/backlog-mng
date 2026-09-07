import type { Request, Response } from "express";
import { createNhom, deleteNhom, listNhom, updateNhom } from "../services/nhom.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listNhomHandler(_req: Request, res: Response) {
  res.json(await listNhom());
}

export async function createNhomHandler(req: Request, res: Response) {
  const { ten_nhom } = req.body ?? {};
  if (!isNonEmptyText(ten_nhom)) {
    return res.status(400).json({ error: "Trường 'ten_nhom' là bắt buộc" });
  }
  const nhom = await createNhom({ ten_nhom });
  res.status(201).json(nhom);
}

export async function updateNhomHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { ten_nhom, thu_tu } = req.body ?? {};
  const nhom = await updateNhom(id, {
    ten_nhom,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!nhom) return res.status(404).json({ error: "Không tìm thấy nhóm" });
  res.json(nhom);
}

export async function deleteNhomHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteNhom(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy nhóm" });
  res.status(204).send();
}

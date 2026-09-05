import type { Request, Response } from "express";
import { createNhom, deleteNhom, listNhom, updateNhom } from "../services/nhom.service.js";

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function listNhomHandler(_req: Request, res: Response) {
  res.json(listNhom());
}

export async function createNhomHandler(req: Request, res: Response) {
  const { ten_nhom } = req.body ?? {};
  if (!isNonEmptyText(ten_nhom)) {
    return res.status(400).json({ error: "Trường 'ten_nhom' là bắt buộc" });
  }
  const nhom = createNhom({ ten_nhom });
  res.status(201).json(nhom);
}

export async function updateNhomHandler(req: Request, res: Response) {
  const { ten_nhom, thu_tu } = req.body ?? {};
  const nhom = updateNhom(Number(req.params.id), {
    ten_nhom,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!nhom) return res.status(404).json({ error: "Không tìm thấy nhóm" });
  res.json(nhom);
}

export async function deleteNhomHandler(req: Request, res: Response) {
  const ok = deleteNhom(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy nhóm" });
  res.status(204).send();
}

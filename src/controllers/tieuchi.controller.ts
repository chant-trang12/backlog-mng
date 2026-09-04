import type { Request, Response } from "express";
import {
  createTieuChiConfig,
  deleteTieuChiConfig,
  listTieuChiConfigs,
  setTieuChiDiemChuan,
  updateTieuChiConfig,
} from "../services/tieuchi.service.js";

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function createTieuChiConfigHandler(req: Request, res: Response) {
  const { nhom, ten_tieu_chi, cach_tinh_diem, co_chi_tieu, thu_tu } = req.body ?? {};
  if (!isNonEmptyText(nhom)) {
    return res.status(400).json({ error: "Trường 'nhom' là bắt buộc" });
  }
  if (!isNonEmptyText(ten_tieu_chi)) {
    return res.status(400).json({ error: "Trường 'ten_tieu_chi' là bắt buộc" });
  }

  const config = createTieuChiConfig({
    nhom,
    ten_tieu_chi,
    cach_tinh_diem,
    co_chi_tieu: Boolean(co_chi_tieu),
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  res.status(201).json(config);
}

export async function listTieuChiConfigsHandler(_req: Request, res: Response) {
  res.json(listTieuChiConfigs());
}

export async function updateTieuChiConfigHandler(req: Request, res: Response) {
  const { nhom, ten_tieu_chi, cach_tinh_diem, co_chi_tieu, thu_tu } = req.body ?? {};
  const config = updateTieuChiConfig(Number(req.params.id), {
    nhom,
    ten_tieu_chi,
    cach_tinh_diem,
    co_chi_tieu: co_chi_tieu !== undefined ? Boolean(co_chi_tieu) : undefined,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!config) return res.status(404).json({ error: "Không tìm thấy tiêu chí" });
  res.json(config);
}

export async function deleteTieuChiConfigHandler(req: Request, res: Response) {
  const ok = deleteTieuChiConfig(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy tiêu chí" });
  res.status(204).send();
}

// PUT /api/tieu-chi/:id/diem-chuan { team_name, diem_chuan, chi_tieu }
export async function setTieuChiDiemChuanHandler(req: Request, res: Response) {
  const { team_name, diem_chuan, chi_tieu } = req.body ?? {};
  if (!isNonEmptyText(team_name)) {
    return res.status(400).json({ error: "Trường 'team_name' là bắt buộc" });
  }
  setTieuChiDiemChuan(Number(req.params.id), team_name, diem_chuan ?? null, chi_tieu ?? null);
  res.json(listTieuChiConfigs().find((c) => c.id === Number(req.params.id)));
}

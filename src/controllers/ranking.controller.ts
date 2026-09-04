import type { Request, Response } from "express";
import {
  addRankingColumn,
  addRankingRow,
  deleteRankingColumn,
  deleteRankingRow,
  getRankingConfig,
  renameRankingColumn,
  setRankingCell,
} from "../services/ranking.service.js";

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function getRankingConfigHandler(_req: Request, res: Response) {
  res.json(getRankingConfig());
}

export async function addRankingRowHandler(_req: Request, res: Response) {
  const viTri = addRankingRow();
  res.status(201).json({ vi_tri: viTri });
}

export async function deleteRankingRowHandler(req: Request, res: Response) {
  const ok = deleteRankingRow(Number(req.params.viTri));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy hàng" });
  res.status(204).send();
}

export async function addRankingColumnHandler(req: Request, res: Response) {
  const { ten_cot } = req.body ?? {};
  if (!isNonEmptyText(ten_cot)) {
    return res.status(400).json({ error: "Trường 'ten_cot' là bắt buộc" });
  }
  const column = addRankingColumn(ten_cot);
  res.status(201).json(column);
}

export async function renameRankingColumnHandler(req: Request, res: Response) {
  const { ten_cot } = req.body ?? {};
  if (!isNonEmptyText(ten_cot)) {
    return res.status(400).json({ error: "Trường 'ten_cot' là bắt buộc" });
  }
  const column = renameRankingColumn(Number(req.params.id), ten_cot);
  if (!column) return res.status(404).json({ error: "Không tìm thấy cột" });
  res.json(column);
}

export async function deleteRankingColumnHandler(req: Request, res: Response) {
  const ok = deleteRankingColumn(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy cột" });
  res.status(204).send();
}

export async function setRankingCellHandler(req: Request, res: Response) {
  const { vi_tri, column_id, gia_tri } = req.body ?? {};
  const viTri = Number(vi_tri);
  const columnId = Number(column_id);
  if (!Number.isFinite(viTri) || !Number.isFinite(columnId)) {
    return res.status(400).json({ error: "Trường 'vi_tri' và 'column_id' là bắt buộc" });
  }
  setRankingCell(viTri, columnId, gia_tri ?? null);
  res.json(getRankingConfig());
}

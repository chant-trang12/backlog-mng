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
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function getRankingConfigHandler(_req: Request, res: Response) {
  res.json(await getRankingConfig());
}

export async function addRankingRowHandler(_req: Request, res: Response) {
  const viTri = await addRankingRow();
  res.status(201).json({ vi_tri: viTri });
}

export async function deleteRankingRowHandler(req: Request, res: Response) {
  const viTri = parsePositiveInt(req.params.viTri);
  if (!Number.isFinite(viTri)) return res.status(400).json({ error: "viTri không hợp lệ" });
  const ok = await deleteRankingRow(viTri);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy hàng" });
  res.status(204).send();
}

export async function addRankingColumnHandler(req: Request, res: Response) {
  const { ten_cot } = req.body ?? {};
  if (!isNonEmptyText(ten_cot)) {
    return res.status(400).json({ error: "Trường 'ten_cot' là bắt buộc" });
  }
  const column = await addRankingColumn(ten_cot);
  res.status(201).json(column);
}

export async function renameRankingColumnHandler(req: Request, res: Response) {
  const { ten_cot } = req.body ?? {};
  if (!isNonEmptyText(ten_cot)) {
    return res.status(400).json({ error: "Trường 'ten_cot' là bắt buộc" });
  }
  const column = await renameRankingColumn(Number(req.params.id), ten_cot);
  if (!column) return res.status(404).json({ error: "Không tìm thấy cột" });
  res.json(column);
}

export async function deleteRankingColumnHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteRankingColumn(id);
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
  await setRankingCell(viTri, columnId, gia_tri ?? null);
  res.json(await getRankingConfig());
}

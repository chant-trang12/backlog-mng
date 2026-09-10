import type { Request, Response } from "express";
import {
  createRoadmapDetail,
  createRoadmapItem,
  deleteRoadmapDetail,
  deleteRoadmapItem,
  listRoadmapDetails,
  listRoadmapItems,
  updateRoadmapDetail,
  updateRoadmapItem,
} from "../services/roadmap.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

// GET /api/roadmap-items?year=YYYY&department_id=X
export async function listRoadmapItemsHandler(req: Request, res: Response) {
  const year = Number(req.query.year);
  if (!Number.isInteger(year)) {
    return res.status(400).json({ error: "Query 'year' không hợp lệ" });
  }
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  res.json(await listRoadmapItems({ year, department_id: departmentId }));
}

export async function createRoadmapItemHandler(req: Request, res: Response) {
  const body = req.body ?? {};
  const year = Number(body.year);
  if (!Number.isInteger(year)) {
    return res.status(400).json({ error: "Trường 'year' là bắt buộc" });
  }
  if (!isNonEmptyText(body.team) || !isNonEmptyText(body.nhiem_vu)) {
    return res.status(400).json({ error: "Trường 'team' và 'nhiem_vu' là bắt buộc" });
  }
  const item = await createRoadmapItem({
    ...body,
    year,
    department_id: body.department_id != null ? Number(body.department_id) : null,
  });
  res.status(201).json(item);
}

export async function updateRoadmapItemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const body = req.body ?? {};
  const item = await updateRoadmapItem(id, {
    ...body,
    year: body.year !== undefined ? Number(body.year) : undefined,
  });
  if (!item) return res.status(404).json({ error: "Không tìm thấy dòng roadmap" });
  res.json(item);
}

export async function deleteRoadmapItemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteRoadmapItem(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy dòng roadmap" });
  res.status(204).send();
}

// ---- Chi tiết công việc theo tháng ----

export async function listRoadmapDetailsHandler(req: Request, res: Response) {
  const itemId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(itemId)) return res.status(400).json({ error: "id không hợp lệ" });
  res.json(await listRoadmapDetails(itemId));
}

export async function createRoadmapDetailHandler(req: Request, res: Response) {
  const itemId = parsePositiveInt(req.params.id);
  if (!Number.isFinite(itemId)) return res.status(400).json({ error: "id không hợp lệ" });
  const body = req.body ?? {};
  const month = Number(body.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: "'month' phải là số 1..12" });
  }
  if (!isNonEmptyText(body.noi_dung)) {
    return res.status(400).json({ error: "'noi_dung' là bắt buộc" });
  }
  res.status(201).json(await createRoadmapDetail(itemId, { ...body, month }));
}

export async function updateRoadmapDetailHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.detailId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const body = req.body ?? {};
  const detail = await updateRoadmapDetail(id, {
    ...body,
    month: body.month !== undefined ? Number(body.month) : undefined,
  });
  if (!detail) return res.status(404).json({ error: "Không tìm thấy chi tiết công việc" });
  res.json(detail);
}

export async function deleteRoadmapDetailHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.detailId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteRoadmapDetail(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy chi tiết công việc" });
  res.status(204).send();
}

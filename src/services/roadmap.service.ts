import { db } from "../db/database.js";
import type {
  CreateRoadmapDetailInput,
  CreateRoadmapItemInput,
  RoadmapDetail,
  RoadmapItem,
  UpdateRoadmapDetailInput,
  UpdateRoadmapItemInput,
} from "../types/backlog.js";

const FIELDS = [
  "team",
  "he_thong",
  "muc_tieu",
  "nhiem_vu",
  "dod",
  "dieu_kien_dam_bao",
  "phan_loai",
  "thoi_gian_bat_dau",
  "thoi_gian_ket_thuc",
  "trang_thai",
  "ghi_chu",
] as const;

function normalize(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (input[f] === undefined) continue;
    const v = input[f];
    out[f] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out;
}

export async function listRoadmapItems(filter: {
  year: number;
  department_id?: number | null;
}): Promise<RoadmapItem[]> {
  const query = db("roadmap_items").where({ year: filter.year });
  if (filter.department_id != null) query.where({ department_id: filter.department_id });
  const rows = await query.orderBy("thoi_gian_ket_thuc", "asc").orderBy("id", "asc");
  return rows as RoadmapItem[];
}

export async function getRoadmapItem(id: number): Promise<RoadmapItem | undefined> {
  const row = await db("roadmap_items").where({ id }).first();
  return row as RoadmapItem | undefined;
}

export async function createRoadmapItem(input: CreateRoadmapItemInput): Promise<RoadmapItem> {
  const [created] = await db("roadmap_items")
    .insert({
      department_id: input.department_id ?? null,
      year: input.year,
      nhiem_vu: input.nhiem_vu,
      trang_thai: input.trang_thai ?? "Chưa thực hiện",
      ...normalize(input as unknown as Record<string, unknown>),
    })
    .returning("*");
  return created as RoadmapItem;
}

export async function updateRoadmapItem(
  id: number,
  input: UpdateRoadmapItemInput,
): Promise<RoadmapItem | undefined> {
  const existing = await getRoadmapItem(id);
  if (!existing) return undefined;
  const [updated] = await db("roadmap_items")
    .where({ id })
    .update({
      ...normalize(input as unknown as Record<string, unknown>),
      ...(input.year !== undefined ? { year: input.year } : {}),
      updated_at: db.fn.now(),
    })
    .returning("*");
  return updated as RoadmapItem;
}

export async function deleteRoadmapItem(id: number): Promise<boolean> {
  const count = await db("roadmap_items").where({ id }).delete();
  return count > 0;
}

// ---- Chi tiết công việc theo tháng ----

export async function listRoadmapDetails(itemId: number): Promise<RoadmapDetail[]> {
  const rows = await db("roadmap_details")
    .where({ roadmap_item_id: itemId })
    .orderBy("month", "asc")
    .orderBy("id", "asc");
  return rows as RoadmapDetail[];
}

export async function createRoadmapDetail(
  itemId: number,
  input: CreateRoadmapDetailInput,
): Promise<RoadmapDetail> {
  const [created] = await db("roadmap_details")
    .insert({
      roadmap_item_id: itemId,
      month: input.month,
      noi_dung: input.noi_dung.trim(),
      trang_thai: input.trang_thai ?? "Chưa thực hiện",
      ghi_chu: input.ghi_chu?.trim() || null,
    })
    .returning("*");
  return created as RoadmapDetail;
}

export async function updateRoadmapDetail(
  id: number,
  input: UpdateRoadmapDetailInput,
): Promise<RoadmapDetail | undefined> {
  const existing = await db("roadmap_details").where({ id }).first();
  if (!existing) return undefined;
  const [updated] = await db("roadmap_details")
    .where({ id })
    .update({
      month: input.month ?? existing.month,
      noi_dung: input.noi_dung?.trim() ?? existing.noi_dung,
      trang_thai: input.trang_thai ?? existing.trang_thai,
      ghi_chu: input.ghi_chu !== undefined ? input.ghi_chu.trim() || null : existing.ghi_chu,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return updated as RoadmapDetail;
}

export async function deleteRoadmapDetail(id: number): Promise<boolean> {
  const count = await db("roadmap_details").where({ id }).delete();
  return count > 0;
}

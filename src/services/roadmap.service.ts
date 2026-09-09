import { db } from "../db/database.js";
import type { CreateRoadmapItemInput, RoadmapItem, UpdateRoadmapItemInput } from "../types/backlog.js";

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

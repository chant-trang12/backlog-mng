import { db } from "../db/database.js";
import type { CreateHeThongInput, HeThongOption, UpdateHeThongInput } from "../types/cskh.js";

export async function listHeThong(): Promise<HeThongOption[]> {
  const rows = await db("he_thong_options").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as HeThongOption[];
}

export async function getHeThong(id: number): Promise<HeThongOption | undefined> {
  const row = await db("he_thong_options").where({ id }).first();
  return row as HeThongOption | undefined;
}

export async function createHeThong(input: CreateHeThongInput): Promise<HeThongOption> {
  const maxRow = await db("he_thong_options").max({ m: "thu_tu" }).first();
  const thuTu = Number((maxRow as any)?.m ?? -1) + 1;
  const [created] = await db("he_thong_options")
    .insert({ ten_he_thong: input.ten_he_thong.trim(), thu_tu: thuTu })
    .returning("*");
  return created as HeThongOption;
}

export async function updateHeThong(
  id: number,
  input: UpdateHeThongInput,
): Promise<HeThongOption | undefined> {
  const existing = await getHeThong(id);
  if (!existing) return undefined;
  const [updated] = await db("he_thong_options")
    .where({ id })
    .update({
      ten_he_thong: input.ten_he_thong?.trim() ?? existing.ten_he_thong,
      thu_tu: input.thu_tu !== undefined ? input.thu_tu : existing.thu_tu,
    })
    .returning("*");
  return updated as HeThongOption;
}

export async function deleteHeThong(id: number): Promise<boolean> {
  const count = await db("he_thong_options").where({ id }).delete();
  return count > 0;
}

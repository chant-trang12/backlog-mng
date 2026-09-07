import { db } from "../db/database.js";
import type { ChucVuOption, CreateChucVuInput, UpdateChucVuInput } from "../types/cskh.js";

export async function listChucVu(): Promise<ChucVuOption[]> {
  const rows = await db("chuc_vu_options").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as ChucVuOption[];
}

export async function getChucVu(id: number): Promise<ChucVuOption | undefined> {
  const row = await db("chuc_vu_options").where({ id }).first();
  return row as ChucVuOption | undefined;
}

export async function createChucVu(input: CreateChucVuInput): Promise<ChucVuOption> {
  const maxRow = await db("chuc_vu_options").max({ max_thu_tu: "thu_tu" }).first();
  const maxThuTu = maxRow && (maxRow as any).max_thu_tu !== null && (maxRow as any).max_thu_tu !== undefined
    ? Number((maxRow as any).max_thu_tu)
    : -1;
  const [created] = await db("chuc_vu_options")
    .insert({
      ten_chuc_vu: input.ten_chuc_vu.trim(),
      thu_tu: maxThuTu + 1,
    })
    .returning("*");
  return created as ChucVuOption;
}

export async function updateChucVu(id: number, input: UpdateChucVuInput): Promise<ChucVuOption | undefined> {
  const existing = await getChucVu(id);
  if (!existing) return undefined;
  const tenChucVu = input.ten_chuc_vu?.trim() ?? existing.ten_chuc_vu;
  const thuTu = input.thu_tu !== undefined ? input.thu_tu : existing.thu_tu;
  const [updated] = await db("chuc_vu_options")
    .where({ id })
    .update({ ten_chuc_vu: tenChucVu, thu_tu: thuTu })
    .returning("*");
  return updated as ChucVuOption;
}

export async function deleteChucVu(id: number): Promise<boolean> {
  const count = await db("chuc_vu_options").where({ id }).delete();
  return count > 0;
}

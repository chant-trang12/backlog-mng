import { db } from "../db/database.js";
import type { CreateMucTieuInput, MucTieuOption, UpdateMucTieuInput } from "../types/cskh.js";

export async function listMucTieu(): Promise<MucTieuOption[]> {
  const rows = await db("muc_tieu_options").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as MucTieuOption[];
}

export async function getMucTieu(id: number): Promise<MucTieuOption | undefined> {
  const row = await db("muc_tieu_options").where({ id }).first();
  return row as MucTieuOption | undefined;
}

export async function createMucTieu(input: CreateMucTieuInput): Promise<MucTieuOption> {
  const maxRow = await db("muc_tieu_options").max({ m: "thu_tu" }).first();
  const thuTu = Number((maxRow as any)?.m ?? -1) + 1;
  const [created] = await db("muc_tieu_options")
    .insert({ ten_muc_tieu: input.ten_muc_tieu.trim(), thu_tu: thuTu })
    .returning("*");
  return created as MucTieuOption;
}

export async function updateMucTieu(
  id: number,
  input: UpdateMucTieuInput,
): Promise<MucTieuOption | undefined> {
  const existing = await getMucTieu(id);
  if (!existing) return undefined;
  const [updated] = await db("muc_tieu_options")
    .where({ id })
    .update({
      ten_muc_tieu: input.ten_muc_tieu?.trim() ?? existing.ten_muc_tieu,
      thu_tu: input.thu_tu !== undefined ? input.thu_tu : existing.thu_tu,
    })
    .returning("*");
  return updated as MucTieuOption;
}

export async function deleteMucTieu(id: number): Promise<boolean> {
  const count = await db("muc_tieu_options").where({ id }).delete();
  return count > 0;
}

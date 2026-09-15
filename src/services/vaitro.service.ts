import { db } from "../db/database.js";
import type { CreateVaiTroInput, UpdateVaiTroInput, VaiTroOption } from "../types/cskh.js";
import { resolveUniqueName } from "../utils/uniqueName.js";

export async function listVaiTro(): Promise<VaiTroOption[]> {
  const rows = await db("vai_tro_options").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as VaiTroOption[];
}

export async function getVaiTro(id: number): Promise<VaiTroOption | undefined> {
  const row = await db("vai_tro_options").where({ id }).first();
  return row as VaiTroOption | undefined;
}

export async function createVaiTro(input: CreateVaiTroInput): Promise<VaiTroOption> {
  const maxRow = await db("vai_tro_options").max({ m: "thu_tu" }).first();
  const thuTu = Number((maxRow as any)?.m ?? -1) + 1;
  const [created] = await db("vai_tro_options")
    .insert({ ten_vai_tro: await resolveUniqueName("vai_tro_options", "ten_vai_tro", input.ten_vai_tro), thu_tu: thuTu })
    .returning("*");
  return created as VaiTroOption;
}

export async function updateVaiTro(
  id: number,
  input: UpdateVaiTroInput,
): Promise<VaiTroOption | undefined> {
  const existing = await getVaiTro(id);
  if (!existing) return undefined;
  const [updated] = await db("vai_tro_options")
    .where({ id })
    .update({
      ten_vai_tro: input.ten_vai_tro?.trim() ?? existing.ten_vai_tro,
      thu_tu: input.thu_tu !== undefined ? input.thu_tu : existing.thu_tu,
    })
    .returning("*");
  return updated as VaiTroOption;
}

export async function deleteVaiTro(id: number): Promise<boolean> {
  const count = await db("vai_tro_options").where({ id }).delete();
  return count > 0;
}

import { db } from "../db/database.js";
import type { CreateNhomInput, NhomOption, UpdateNhomInput } from "../types/cskh.js";
import { resolveUniqueName } from "../utils/uniqueName.js";

export async function listNhom(): Promise<NhomOption[]> {
  const rows = await db("nhom_options").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as NhomOption[];
}

export async function getNhom(id: number): Promise<NhomOption | undefined> {
  const row = await db("nhom_options").where({ id }).first();
  return row as NhomOption | undefined;
}

export async function createNhom(input: CreateNhomInput): Promise<NhomOption> {
  const maxRow = await db("nhom_options").max({ max_thu_tu: "thu_tu" }).first();
  const maxThuTu = maxRow && (maxRow as any).max_thu_tu !== null && (maxRow as any).max_thu_tu !== undefined
    ? Number((maxRow as any).max_thu_tu)
    : -1;
  const [created] = await db("nhom_options")
    .insert({
      ten_nhom: await resolveUniqueName("nhom_options", "ten_nhom", input.ten_nhom),
      thu_tu: maxThuTu + 1,
    })
    .returning("*");
  return created as NhomOption;
}

export async function updateNhom(id: number, input: UpdateNhomInput): Promise<NhomOption | undefined> {
  const existing = await getNhom(id);
  if (!existing) return undefined;
  const tenNhom = input.ten_nhom?.trim() ?? existing.ten_nhom;
  const thuTu = input.thu_tu !== undefined ? input.thu_tu : existing.thu_tu;
  const [updated] = await db("nhom_options")
    .where({ id })
    .update({ ten_nhom: tenNhom, thu_tu: thuTu })
    .returning("*");
  return updated as NhomOption;
}

export async function deleteNhom(id: number): Promise<boolean> {
  const count = await db("nhom_options").where({ id }).delete();
  return count > 0;
}

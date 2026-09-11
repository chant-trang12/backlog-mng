import { db } from "../db/database.js";
import type { CreatePhanLoaiInput, PhanLoaiOption, UpdatePhanLoaiInput } from "../types/cskh.js";
import { resolveUniqueName } from "../utils/uniqueName.js";

export async function listPhanLoai(): Promise<PhanLoaiOption[]> {
  const rows = await db("phan_loai_options").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as PhanLoaiOption[];
}

export async function getPhanLoai(id: number): Promise<PhanLoaiOption | undefined> {
  const row = await db("phan_loai_options").where({ id }).first();
  return row as PhanLoaiOption | undefined;
}

export async function createPhanLoai(input: CreatePhanLoaiInput): Promise<PhanLoaiOption> {
  const maxRow = await db("phan_loai_options").max({ max_thu_tu: "thu_tu" }).first();
  const maxThuTu = maxRow && (maxRow as any).max_thu_tu !== null && (maxRow as any).max_thu_tu !== undefined
    ? Number((maxRow as any).max_thu_tu)
    : -1;
  const [created] = await db("phan_loai_options")
    .insert({
      ten_phan_loai: await resolveUniqueName("phan_loai_options", "ten_phan_loai", input.ten_phan_loai),
      thu_tu: maxThuTu + 1,
    })
    .returning("*");
  return created as PhanLoaiOption;
}

export async function updatePhanLoai(id: number, input: UpdatePhanLoaiInput): Promise<PhanLoaiOption | undefined> {
  const existing = await getPhanLoai(id);
  if (!existing) return undefined;
  const tenPhanLoai = input.ten_phan_loai?.trim() ?? existing.ten_phan_loai;
  const thuTu = input.thu_tu !== undefined ? input.thu_tu : existing.thu_tu;
  const [updated] = await db("phan_loai_options")
    .where({ id })
    .update({ ten_phan_loai: tenPhanLoai, thu_tu: thuTu })
    .returning("*");
  return updated as PhanLoaiOption;
}

export async function deletePhanLoai(id: number): Promise<boolean> {
  const count = await db("phan_loai_options").where({ id }).delete();
  return count > 0;
}

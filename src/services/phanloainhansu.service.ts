import { db } from "../db/database.js";
import type {
  CreatePhanLoaiNhanSuInput,
  PhanLoaiNhanSuOption,
  UpdatePhanLoaiNhanSuInput,
} from "../types/cskh.js";
import { resolveUniqueName } from "../utils/uniqueName.js";

export async function listPhanLoaiNhanSu(): Promise<PhanLoaiNhanSuOption[]> {
  const rows = await db("phan_loai_nhan_su_options").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as PhanLoaiNhanSuOption[];
}

export async function getPhanLoaiNhanSu(id: number): Promise<PhanLoaiNhanSuOption | undefined> {
  const row = await db("phan_loai_nhan_su_options").where({ id }).first();
  return row as PhanLoaiNhanSuOption | undefined;
}

export async function createPhanLoaiNhanSu(
  input: CreatePhanLoaiNhanSuInput,
): Promise<PhanLoaiNhanSuOption> {
  const maxRow = await db("phan_loai_nhan_su_options").max({ m: "thu_tu" }).first();
  const thuTu = Number((maxRow as any)?.m ?? -1) + 1;
  const [created] = await db("phan_loai_nhan_su_options")
    .insert({
      ten_phan_loai: await resolveUniqueName("phan_loai_nhan_su_options", "ten_phan_loai", input.ten_phan_loai),
      thu_tu: thuTu,
    })
    .returning("*");
  return created as PhanLoaiNhanSuOption;
}

export async function updatePhanLoaiNhanSu(
  id: number,
  input: UpdatePhanLoaiNhanSuInput,
): Promise<PhanLoaiNhanSuOption | undefined> {
  const existing = await getPhanLoaiNhanSu(id);
  if (!existing) return undefined;
  const [updated] = await db("phan_loai_nhan_su_options")
    .where({ id })
    .update({
      ten_phan_loai: input.ten_phan_loai?.trim() ?? existing.ten_phan_loai,
      thu_tu: input.thu_tu !== undefined ? input.thu_tu : existing.thu_tu,
    })
    .returning("*");
  return updated as PhanLoaiNhanSuOption;
}

export async function deletePhanLoaiNhanSu(id: number): Promise<boolean> {
  const count = await db("phan_loai_nhan_su_options").where({ id }).delete();
  return count > 0;
}

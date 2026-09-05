import { db } from "../db/database.js";
import type { CreatePhanLoaiInput, PhanLoaiOption, UpdatePhanLoaiInput } from "../types/cskh.js";

export function listPhanLoai(): PhanLoaiOption[] {
  return db.prepare(`SELECT * FROM phan_loai_options ORDER BY thu_tu ASC, id ASC`).all() as PhanLoaiOption[];
}

export function getPhanLoai(id: number): PhanLoaiOption | undefined {
  return db.prepare(`SELECT * FROM phan_loai_options WHERE id = ?`).get(id) as PhanLoaiOption | undefined;
}

export function createPhanLoai(input: CreatePhanLoaiInput): PhanLoaiOption {
  const maxRow = db.prepare(`SELECT COALESCE(MAX(thu_tu), -1) AS max_thu_tu FROM phan_loai_options`).get() as {
    max_thu_tu: number;
  };
  return db
    .prepare(`INSERT INTO phan_loai_options (ten_phan_loai, thu_tu) VALUES (?, ?) RETURNING *`)
    .get(input.ten_phan_loai.trim(), maxRow.max_thu_tu + 1) as PhanLoaiOption;
}

export function updatePhanLoai(id: number, input: UpdatePhanLoaiInput): PhanLoaiOption | undefined {
  const existing = getPhanLoai(id);
  if (!existing) return undefined;
  const tenPhanLoai = input.ten_phan_loai?.trim() ?? existing.ten_phan_loai;
  const thuTu = input.thu_tu ?? existing.thu_tu;
  return db
    .prepare(`UPDATE phan_loai_options SET ten_phan_loai = ?, thu_tu = ? WHERE id = ? RETURNING *`)
    .get(tenPhanLoai, thuTu, id) as PhanLoaiOption;
}

export function deletePhanLoai(id: number): boolean {
  return db.prepare(`DELETE FROM phan_loai_options WHERE id = ?`).run(id).changes > 0;
}

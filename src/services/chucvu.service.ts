import { db } from "../db/database.js";
import type { ChucVuOption, CreateChucVuInput, UpdateChucVuInput } from "../types/cskh.js";

export function listChucVu(): ChucVuOption[] {
  return db.prepare(`SELECT * FROM chuc_vu_options ORDER BY thu_tu ASC, id ASC`).all() as ChucVuOption[];
}

export function getChucVu(id: number): ChucVuOption | undefined {
  return db.prepare(`SELECT * FROM chuc_vu_options WHERE id = ?`).get(id) as ChucVuOption | undefined;
}

export function createChucVu(input: CreateChucVuInput): ChucVuOption {
  const maxRow = db.prepare(`SELECT COALESCE(MAX(thu_tu), -1) AS max_thu_tu FROM chuc_vu_options`).get() as {
    max_thu_tu: number;
  };
  return db
    .prepare(`INSERT INTO chuc_vu_options (ten_chuc_vu, thu_tu) VALUES (?, ?) RETURNING *`)
    .get(input.ten_chuc_vu.trim(), maxRow.max_thu_tu + 1) as ChucVuOption;
}

export function updateChucVu(id: number, input: UpdateChucVuInput): ChucVuOption | undefined {
  const existing = getChucVu(id);
  if (!existing) return undefined;
  const tenChucVu = input.ten_chuc_vu?.trim() ?? existing.ten_chuc_vu;
  const thuTu = input.thu_tu ?? existing.thu_tu;
  return db
    .prepare(`UPDATE chuc_vu_options SET ten_chuc_vu = ?, thu_tu = ? WHERE id = ? RETURNING *`)
    .get(tenChucVu, thuTu, id) as ChucVuOption;
}

export function deleteChucVu(id: number): boolean {
  return db.prepare(`DELETE FROM chuc_vu_options WHERE id = ?`).run(id).changes > 0;
}

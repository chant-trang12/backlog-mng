import { db } from "../db/database.js";
import type { CreateNhomInput, NhomOption, UpdateNhomInput } from "../types/cskh.js";

export function listNhom(): NhomOption[] {
  return db.prepare(`SELECT * FROM nhom_options ORDER BY thu_tu ASC, id ASC`).all() as NhomOption[];
}

export function getNhom(id: number): NhomOption | undefined {
  return db.prepare(`SELECT * FROM nhom_options WHERE id = ?`).get(id) as NhomOption | undefined;
}

export function createNhom(input: CreateNhomInput): NhomOption {
  const maxRow = db.prepare(`SELECT COALESCE(MAX(thu_tu), -1) AS max_thu_tu FROM nhom_options`).get() as {
    max_thu_tu: number;
  };
  return db
    .prepare(`INSERT INTO nhom_options (ten_nhom, thu_tu) VALUES (?, ?) RETURNING *`)
    .get(input.ten_nhom.trim(), maxRow.max_thu_tu + 1) as NhomOption;
}

export function updateNhom(id: number, input: UpdateNhomInput): NhomOption | undefined {
  const existing = getNhom(id);
  if (!existing) return undefined;
  const tenNhom = input.ten_nhom?.trim() ?? existing.ten_nhom;
  const thuTu = input.thu_tu ?? existing.thu_tu;
  return db
    .prepare(`UPDATE nhom_options SET ten_nhom = ?, thu_tu = ? WHERE id = ? RETURNING *`)
    .get(tenNhom, thuTu, id) as NhomOption;
}

export function deleteNhom(id: number): boolean {
  return db.prepare(`DELETE FROM nhom_options WHERE id = ?`).run(id).changes > 0;
}
